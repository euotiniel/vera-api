import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface CreateAttestationPayloadInput {
  documentPublicId: string;
  organization: string;
  version: number;
  sha256: string;
  registeredAt: string;
}

export interface VeraAttestation {
  payload: string;
  signature: string;
  algorithm: 'Ed25519';
  keyId: string;
}

@Injectable()
export class AttestationService {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly keyId: string;

  constructor(
    private readonly configService: ConfigService,
  ) {
    const privateKeyPath =
      this.configService.get<string>(
        'VERA_SIGNING_PRIVATE_KEY_PATH',
      );

    const publicKeyPath =
      this.configService.get<string>(
        'VERA_SIGNING_PUBLIC_KEY_PATH',
      );

    const keyId =
      this.configService.get<string>(
        'VERA_SIGNING_KEY_ID',
      );

    if (!privateKeyPath) {
      throw new Error(
        'VERA_SIGNING_PRIVATE_KEY_PATH is not defined',
      );
    }

    if (!publicKeyPath) {
      throw new Error(
        'VERA_SIGNING_PUBLIC_KEY_PATH is not defined',
      );
    }

    if (!keyId) {
      throw new Error(
        'VERA_SIGNING_KEY_ID is not defined',
      );
    }

    const privateKeyPem = readFileSync(
      resolve(process.cwd(), privateKeyPath),
      'utf8',
    );

    const publicKeyPem = readFileSync(
      resolve(process.cwd(), publicKeyPath),
      'utf8',
    );

    this.privateKey = createPrivateKey(privateKeyPem);
    this.publicKey = createPublicKey(publicKeyPem);
    this.keyId = keyId;
  }

  createPayload(
    input: CreateAttestationPayloadInput,
  ): string {
    return JSON.stringify({
      schema: 'vera.attestation.v1',
      documentPublicId: input.documentPublicId,
      organization: input.organization,
      version: input.version,
      sha256: input.sha256,
      registeredAt: input.registeredAt,
    });
  }

  create(
    input: CreateAttestationPayloadInput,
  ): VeraAttestation {
    const payload = this.createPayload(input);

    const signature = sign(
      null,
      Buffer.from(payload, 'utf8'),
      this.privateKey,
    ).toString('base64url');

    return {
      payload,
      signature,
      algorithm: 'Ed25519',
      keyId: this.keyId,
    };
  }

  verify(
    payload: string,
    signature: string,
  ): boolean {
    try {
      return verify(
        null,
        Buffer.from(payload, 'utf8'),
        this.publicKey,
        Buffer.from(signature, 'base64url'),
      );
    } catch {
      return false;
    }
  }
}
