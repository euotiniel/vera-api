import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

import { isValidPublicId } from './public-id.js';
import { SigningService } from './signing.service.js';

interface QrProofHeader {
  typ: 'VQR';
  alg: 'Ed25519';
  kid: string;
}

export interface QrAttestationEnvelope {
  payload: string;
  signature: string;
  algorithm: string;
  keyId: string;
}

export interface QrProofPayload {
  schema: 'vera.qr.v2';

  purpose:
    'DOCUMENT_VERIFICATION';

  publicId: string;

  version: number;

  sha256: string;

  registeredAt: string;

  attestationHash: string;
}

export interface QrProofVerification {
  valid: boolean;

  structureValid: boolean;

  signatureValid: boolean;

  payload:
    | QrProofPayload
    | null;

  keyId:
    | string
    | null;
}

@Injectable()
export class QrProofService {
  private readonly maxTokenLength =
    4096;

  constructor(
    private readonly signingService:
      SigningService,

    private readonly configService:
      ConfigService,
  ) {}

  create(input: {
    publicId: string;

    version: number;

    sha256: string;

    registeredAt: string;

    attestation:
      QrAttestationEnvelope;
  }) {
    const publicId =
      input.publicId
        .trim()
        .toUpperCase();

    if (
      !isValidPublicId(
        publicId,
      )
    ) {
      throw new Error(
        'Invalid Vera public ID',
      );
    }

    if (
      !Number.isSafeInteger(
        input.version,
      ) ||
      input.version < 1
    ) {
      throw new Error(
        'Invalid document version',
      );
    }

    const sha256 =
      input.sha256
        .trim()
        .toLowerCase();

    if (
      !/^[a-f0-9]{64}$/.test(
        sha256,
      )
    ) {
      throw new Error(
        'Invalid document SHA-256',
      );
    }

    if (
      !this.isCanonicalIsoDate(
        input.registeredAt,
      )
    ) {
      throw new Error(
        'Invalid registeredAt',
      );
    }

    const keyId =
      this.configService
        .get<string>(
          'VERA_SIGNING_KEY_ID',
        );

    if (!keyId) {
      throw new Error(
        'VERA_SIGNING_KEY_ID is not defined',
      );
    }

    const attestationHash =
      this.calculateAttestationHash(
        input.attestation,
      );

    const header:
      QrProofHeader = {
        typ:
          'VQR',

        alg:
          'Ed25519',

        kid:
          keyId,
      };

    const payload:
      QrProofPayload = {
        schema:
          'vera.qr.v2',

        purpose:
          'DOCUMENT_VERIFICATION',

        publicId,

        version:
          input.version,

        sha256,

        registeredAt:
          input.registeredAt,

        attestationHash,
      };

    const headerPart =
      this.encodeJson(
        header,
      );

    const payloadPart =
      this.encodeJson(
        payload,
      );

    /*
     * Domain separation.
     *
     * Uma assinatura feita para outro
     * protocolo Vera não pode ser usada
     * diretamente como QR Proof.
     */
    const signingInput =
      [
        'vqr2',
        headerPart,
        payloadPart,
      ].join('.');

    const signed =
      this.signingService.sign(
        signingInput,
      );

    if (
      signed.algorithm !==
        'Ed25519' ||
      signed.keyId !==
        keyId
    ) {
      throw new Error(
        'Signing key mismatch',
      );
    }

    const token =
      [
        signingInput,
        signed.signature,
      ].join('.');

    if (
      token.length >
      this.maxTokenLength
    ) {
      throw new Error(
        'QR proof exceeds maximum size',
      );
    }

    return {
      token,

      payload,

      algorithm:
        signed.algorithm,

      keyId:
        signed.keyId,
    };
  }

  verify(
    tokenInput: string,
  ): QrProofVerification {
    if (
      typeof tokenInput !==
      'string'
    ) {
      return this.invalid();
    }

    const token =
      tokenInput.trim();

    if (
      token.length === 0 ||
      token.length >
        this.maxTokenLength
    ) {
      return this.invalid();
    }

    /*
     * Não aceitamos whitespace interno.
     */
    if (/\s/.test(token)) {
      return this.invalid();
    }

    const parts =
      token.split('.');

    if (
      parts.length !== 4 ||
      parts[0] !== 'vqr2'
    ) {
      return this.invalid();
    }

    const [
      prefix,
      headerPart,
      payloadPart,
      signaturePart,
    ] = parts;

    if (
      !this.isBase64UrlSegment(
        headerPart,
        512,
      ) ||
      !this.isBase64UrlSegment(
        payloadPart,
        2048,
      ) ||
      !/^[A-Za-z0-9_-]{86}$/.test(
        signaturePart,
      )
    ) {
      return this.invalid();
    }

    let rawHeader:
      unknown;

    let rawPayload:
      unknown;

    try {
      rawHeader =
        this.decodeJson<unknown>(
          headerPart,
        );

      rawPayload =
        this.decodeJson<unknown>(
          payloadPart,
        );
    } catch {
      return this.invalid();
    }

    if (
      !this.hasExactKeys(
        rawHeader,
        [
          'typ',
          'alg',
          'kid',
        ],
      ) ||
      !this.hasExactKeys(
        rawPayload,
        [
          'schema',
          'purpose',
          'publicId',
          'version',
          'sha256',
          'registeredAt',
          'attestationHash',
        ],
      )
    ) {
      return this.invalid();
    }

    const header =
      rawHeader as
        QrProofHeader;

    const payload =
      rawPayload as
        QrProofPayload;

    /*
     * Exigimos também que a serialização
     * seja exatamente a serialização
     * canónica produzida pela Vera.
     *
     * Evita representações JSON alternativas,
     * duplicate keys e ambiguidades.
     */
    const canonicalEncoding =
      this.encodeJson(
        header,
      ) ===
        headerPart &&
      this.encodeJson(
        payload,
      ) ===
        payloadPart;

    const structureValid =
      canonicalEncoding &&

      header.typ ===
        'VQR' &&

      header.alg ===
        'Ed25519' &&

      typeof header.kid ===
        'string' &&

      /^[A-Za-z0-9._:-]{1,128}$/.test(
        header.kid,
      ) &&

      payload.schema ===
        'vera.qr.v2' &&

      payload.purpose ===
        'DOCUMENT_VERIFICATION' &&

      typeof payload.publicId ===
        'string' &&

      payload.publicId ===
        payload.publicId
          .toUpperCase() &&

      isValidPublicId(
        payload.publicId,
      ) &&

      Number.isSafeInteger(
        payload.version,
      ) &&

      payload.version >= 1 &&

      typeof payload.sha256 ===
        'string' &&

      /^[a-f0-9]{64}$/.test(
        payload.sha256,
      ) &&

      typeof payload.registeredAt ===
        'string' &&

      this.isCanonicalIsoDate(
        payload.registeredAt,
      ) &&

      typeof payload.attestationHash ===
        'string' &&

      /^[a-f0-9]{64}$/.test(
        payload.attestationHash,
      );

    if (!structureValid) {
      return {
        valid:
          false,

        structureValid:
          false,

        signatureValid:
          false,

        payload:
          null,

        keyId:
          typeof header.kid ===
            'string'
            ? header.kid
            : null,
      };
    }

    const signingInput =
      [
        prefix,
        headerPart,
        payloadPart,
      ].join('.');

    let signatureValid =
      false;

    try {
      signatureValid =
        this.signingService.verify({
          payload:
            signingInput,

          signature:
            signaturePart,

          algorithm:
            header.alg,

          keyId:
            header.kid,
        });
    } catch {
      signatureValid =
        false;
    }

    return {
      valid:
        signatureValid,

      structureValid:
        true,

      signatureValid,

      payload:
        signatureValid
          ? payload
          : null,

      keyId:
        header.kid,
    };
  }

  calculateAttestationHash(
    input:
      QrAttestationEnvelope,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          payload:
            input.payload,

          signature:
            input.signature,

          algorithm:
            input.algorithm,

          keyId:
            input.keyId,
        }),
      )
      .digest('hex');
  }

  private encodeJson(
    value: unknown,
  ): string {
    return Buffer
      .from(
        JSON.stringify(
          value,
        ),
        'utf8',
      )
      .toString(
        'base64url',
      );
  }

  private decodeJson<T>(
    value: string,
  ): T {
    return JSON.parse(
      Buffer
        .from(
          value,
          'base64url',
        )
        .toString(
          'utf8',
        ),
    ) as T;
  }

  private hasExactKeys(
    value: unknown,
    expectedKeys: string[],
  ): boolean {
    if (
      typeof value !==
        'object' ||
      value === null ||
      Array.isArray(value)
    ) {
      return false;
    }

    const actualKeys =
      Object.keys(
        value,
      ).sort();

    const expected =
      [...expectedKeys]
        .sort();

    return (
      actualKeys.length ===
        expected.length &&
      actualKeys.every(
        (
          key,
          index,
        ) =>
          key ===
          expected[index],
      )
    );
  }

  private isBase64UrlSegment(
    value: string,
    maxLength: number,
  ): boolean {
    return (
      value.length > 0 &&
      value.length <=
        maxLength &&
      /^[A-Za-z0-9_-]+$/.test(
        value,
      )
    );
  }

  private isCanonicalIsoDate(
    value: string,
  ): boolean {
    try {
      const date =
        new Date(value);

      return (
        !Number.isNaN(
          date.getTime(),
        ) &&
        date.toISOString() ===
          value
      );
    } catch {
      return false;
    }
  }

  private invalid():
    QrProofVerification {
    return {
      valid:
        false,

      structureValid:
        false,

      signatureValid:
        false,

      payload:
        null,

      keyId:
        null,
    };
  }
}