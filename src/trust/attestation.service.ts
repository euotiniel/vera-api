import { Injectable } from '@nestjs/common';
import { SigningService } from './signing.service.js';

export interface CreateAttestationInput {
  documentPublicId: string;

  organizationId: string;
  organizationSlug: string;
  organizationName: string;

  title: string;
  type: string | null;
  reference: string | null;
  issuedAt: string | null;

  version: number;

  filename: string;
  mimeType: string;
  size: number;
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
  constructor(
    private readonly signingService: SigningService,
  ) {}

  createPayload(
    input: CreateAttestationInput,
  ): string {
    return JSON.stringify({
      schema: 'vera.attestation.v2',

      document: {
        publicId: input.documentPublicId,
        title: input.title,
        type: input.type,
        reference: input.reference,
        issuedAt: input.issuedAt,
      },

      issuer: {
        id: input.organizationId,
        slug: input.organizationSlug,
        name: input.organizationName,
      },

      version: {
        number: input.version,
        filename: input.filename,
        mimeType: input.mimeType,
        size: input.size,
        sha256: input.sha256,
        registeredAt: input.registeredAt,
      },
    });
  }

  create(
    input: CreateAttestationInput,
  ): VeraAttestation {
    const payload = this.createPayload(input);

    const signed =
      this.signingService.sign(payload);

    return {
      payload,
      signature: signed.signature,
      algorithm: signed.algorithm,
      keyId: signed.keyId,
    };
  }

  verify(
    payload: string,
    signature: string,
    algorithm = 'Ed25519',
    keyId?: string,
  ): boolean {
    if (!keyId) {
      return false;
    }

    return this.signingService.verify({
      payload,
      signature,
      algorithm,
      keyId,
    });
  }
}