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

export interface SignedPayload {
  signature: string;
  algorithm: 'Ed25519';
  keyId: string;
}

interface VerifySignatureInput {
  payload: string;
  signature: string;
  algorithm: string;
  keyId: string;
}

@Injectable()
export class SigningService {
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

  sign(payload: string): SignedPayload {
    const signature = sign(
      null,
      Buffer.from(payload, 'utf8'),
      this.privateKey,
    ).toString('base64url');

    return {
      signature,
      algorithm: 'Ed25519',
      keyId: this.keyId,
    };
  }

  verify(input: VerifySignatureInput): boolean {
    if (input.algorithm !== 'Ed25519') {
      return false;
    }

    // Por enquanto existe apenas uma chave Vera ativa.
    // Depois criaremos um registry por keyId para rotação.
    if (input.keyId !== this.keyId) {
      return false;
    }

    try {
      return verify(
        null,
        Buffer.from(input.payload, 'utf8'),
        this.publicKey,
        Buffer.from(
          input.signature,
          'base64url',
        ),
      );
    } catch {
      return false;
    }
  }

  getCurrentKeyId(): string {
    return this.keyId;
  }
}