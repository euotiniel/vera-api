import {
  Injectable,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  createPrivateKey,
  createPublicKey,
  KeyObject,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';

import {
  readFileSync,
} from 'node:fs';

import {
  resolve,
} from 'node:path';

interface VerifySignatureInput {
  payload: string;

  signature: string;

  algorithm: string;

  keyId: string;
}

interface SignResult {
  signature: string;

  algorithm: 'Ed25519';

  keyId: string;
}

@Injectable()
export class SigningService {
  private readonly algorithm =
    'Ed25519' as const;

  private readonly activeKeyId:
    string;

  private readonly privateKey:
    KeyObject;

  private readonly publicKeyCache =
    new Map<
      string,
      KeyObject
    >();

  private readonly publicKeysDirectory:
    string;

  constructor(
    private readonly configService:
      ConfigService,
  ) {
    const activeKeyId =
      this.configService
        .get<string>(
          'VERA_SIGNING_KEY_ID',
        )
        ?.trim();

    if (!activeKeyId) {
      throw new Error(
        'VERA_SIGNING_KEY_ID is not defined',
      );
    }

    if (
      !this.isValidKeyId(
        activeKeyId,
      )
    ) {
      throw new Error(
        'VERA_SIGNING_KEY_ID is invalid',
      );
    }

    const privateKeyPath =
      this.configService
        .get<string>(
          'VERA_SIGNING_PRIVATE_KEY_PATH',
        )
        ?.trim();

    if (!privateKeyPath) {
      throw new Error(
        'VERA_SIGNING_PRIVATE_KEY_PATH is not defined',
      );
    }

    const publicKeysDirectory =
      this.configService
        .get<string>(
          'VERA_SIGNING_PUBLIC_KEYS_DIR',
        )
        ?.trim();

    if (!publicKeysDirectory) {
      throw new Error(
        'VERA_SIGNING_PUBLIC_KEYS_DIR is not defined',
      );
    }

    this.activeKeyId =
      activeKeyId;

    this.publicKeysDirectory =
      resolve(
        process.cwd(),
        publicKeysDirectory,
      );

    const resolvedPrivateKeyPath =
      resolve(
        process.cwd(),
        privateKeyPath,
      );

    let privateKeyPem:
      Buffer;

    try {
      privateKeyPem =
        readFileSync(
          resolvedPrivateKeyPath,
        );
    } catch {
      throw new Error(
        `Unable to read active signing private key: ${resolvedPrivateKeyPath}`,
      );
    }

    try {
      this.privateKey =
        createPrivateKey(
          privateKeyPem,
        );
    } catch {
      throw new Error(
        'The active Vera private key is invalid',
      );
    }

    if (
      this.privateKey
        .asymmetricKeyType !==
      'ed25519'
    ) {
      throw new Error(
        'The active Vera private key must be Ed25519',
      );
    }

    const activePublicKey =
      this.getPublicKey(
        this.activeKeyId,
      );

    if (!activePublicKey) {
      throw new Error(
        `Public key not found for active keyId: ${this.activeKeyId}`,
      );
    }

    /*
     * A chave privada ativa e a public key
     * registada sob o mesmo keyId precisam
     * formar exatamente o mesmo par.
     *
     * Isto é validado no arranque.
     */
    const derivedPublicKey =
      createPublicKey(
        this.privateKey,
      );

    const derivedPublicDer =
      derivedPublicKey.export({
        type:
          'spki',

        format:
          'der',
      });

    const registeredPublicDer =
      activePublicKey.export({
        type:
          'spki',

        format:
          'der',
      });

    if (
      !Buffer.from(
        derivedPublicDer,
      ).equals(
        Buffer.from(
          registeredPublicDer,
        ),
      )
    ) {
      throw new Error(
        [
          'Active Vera signing key mismatch.',
          `keyId "${this.activeKeyId}"`,
          'does not correspond to the configured private key.',
        ].join(' '),
      );
    }

    /*
     * Segundo teste independente:
     * fazemos uma assinatura efémera
     * e exigimos que a public key ativa
     * consiga validá-la.
     */
    const startupChallenge =
      [
        'vera.signing.startup-check.v1',
        this.activeKeyId,
      ].join(':');

    const startupSignature =
      cryptoSign(
        null,

        Buffer.from(
          startupChallenge,
          'utf8',
        ),

        this.privateKey,
      );

    const startupVerified =
      cryptoVerify(
        null,

        Buffer.from(
          startupChallenge,
          'utf8',
        ),

        activePublicKey,

        startupSignature,
      );

    if (!startupVerified) {
      throw new Error(
        `Active Vera signing key pair validation failed for keyId: ${this.activeKeyId}`,
      );
    }
  }

  sign(
    payload: string,
  ): SignResult {
    if (
      typeof payload !==
        'string'
    ) {
      throw new Error(
        'Signing payload must be a string',
      );
    }

    const signature =
      cryptoSign(
        null,

        Buffer.from(
          payload,
          'utf8',
        ),

        this.privateKey,
      );

    return {
      signature:
        signature.toString(
          'base64url',
        ),

      algorithm:
        this.algorithm,

      keyId:
        this.activeKeyId,
    };
  }

  verify(
    input:
      VerifySignatureInput,
  ): boolean {
    if (
      input.algorithm !==
        this.algorithm
    ) {
      return false;
    }

    if (
      typeof input.payload !==
        'string' ||
      typeof input.signature !==
        'string' ||
      typeof input.keyId !==
        'string'
    ) {
      return false;
    }

    if (
      !this.isValidKeyId(
        input.keyId,
      )
    ) {
      return false;
    }

    if (
      !/^[A-Za-z0-9_-]{86}$/.test(
        input.signature,
      )
    ) {
      return false;
    }

    const publicKey =
      this.getPublicKey(
        input.keyId,
      );

    /*
     * Nunca fazemos fallback para
     * a chave ativa quando o keyId
     * não é conhecido.
     */
    if (!publicKey) {
      return false;
    }

    let signatureBuffer:
      Buffer;

    try {
      signatureBuffer =
        Buffer.from(
          input.signature,
          'base64url',
        );
    } catch {
      return false;
    }

    if (
      signatureBuffer.length !==
        64
    ) {
      return false;
    }

    try {
      return cryptoVerify(
        null,

        Buffer.from(
          input.payload,
          'utf8',
        ),

        publicKey,

        signatureBuffer,
      );
    } catch {
      return false;
    }
  }

  getActiveKeyId():
    string {
    return this.activeKeyId;
  }

  private getPublicKey(
    keyId: string,
  ):
    | KeyObject
    | null {
    if (
      !this.isValidKeyId(
        keyId,
      )
    ) {
      return null;
    }

    const cached =
      this.publicKeyCache
        .get(
          keyId,
        );

    if (cached) {
      return cached;
    }

    const publicKeyPath =
      resolve(
        this.publicKeysDirectory,
        `${keyId}.pem`,
      );

    const expectedPrefix =
      `${this.publicKeysDirectory}/`;

    if (
      !publicKeyPath.startsWith(
        expectedPrefix,
      )
    ) {
      return null;
    }

    let publicKeyPem:
      Buffer;

    try {
      publicKeyPem =
        readFileSync(
          publicKeyPath,
        );
    } catch {
      return null;
    }

    let publicKey:
      KeyObject;

    try {
      publicKey =
        createPublicKey(
          publicKeyPem,
        );
    } catch {
      return null;
    }

    if (
      publicKey.asymmetricKeyType !==
        'ed25519'
    ) {
      return null;
    }

    this.publicKeyCache
      .set(
        keyId,
        publicKey,
      );

    return publicKey;
  }

  private isValidKeyId(
    keyId: string,
  ): boolean {
    return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
      .test(
        keyId,
      );
  }
}