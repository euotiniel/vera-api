import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { SigningService } from './signing.service.js';

type DocumentStatusValue =
  | 'PENDING'
  | 'VALID'
  | 'REVOKED'
  | 'REPLACED'
  | 'EXPIRED';

export interface CreateRegisteredEventInput {
  documentPublicId: string;
  toStatus: DocumentStatusValue;
  occurredAt: string;
}

export interface SignedLifecycleEvent {
  sequence: number;
  type: 'REGISTERED';

  fromStatus: null;
  toStatus: DocumentStatusValue;

  reason: null;

  previousEventHash: null;

  payload: string;
  signature: string;

  algorithm: 'Ed25519';
  keyId: string;

  eventHash: string;
}

@Injectable()
export class LifecycleService {
  constructor(
    private readonly signingService: SigningService,
  ) {}

  createRegisteredEvent(
    input: CreateRegisteredEventInput,
  ): SignedLifecycleEvent {
    const sequence = 1;
    const type = 'REGISTERED' as const;

    const fromStatus = null;
    const toStatus = input.toStatus;
    const reason = null;

    const previousEventHash = null;

    const payload = JSON.stringify({
      schema: 'vera.lifecycle.v1',

      documentPublicId:
        input.documentPublicId,

      sequence,
      type,

      fromStatus,
      toStatus,

      reason,

      previousEventHash,

      occurredAt: input.occurredAt,
    });

    const signed =
      this.signingService.sign(payload);

    const eventHash = this.calculateEventHash({
      payload,
      signature: signed.signature,
      algorithm: signed.algorithm,
      keyId: signed.keyId,
    });

    return {
      sequence,
      type,

      fromStatus,
      toStatus,

      reason,

      previousEventHash,

      payload,
      signature: signed.signature,

      algorithm: signed.algorithm,
      keyId: signed.keyId,

      eventHash,
    };
  }

  calculateEventHash(input: {
    payload: string;
    signature: string;
    algorithm: string;
    keyId: string;
  }): string {
    const envelope = JSON.stringify({
      payload: input.payload,
      signature: input.signature,
      algorithm: input.algorithm,
      keyId: input.keyId,
    });

    return createHash('sha256')
      .update(envelope, 'utf8')
      .digest('hex');
  }

  verifySignature(input: {
    payload: string;
    signature: string;
    algorithm: string;
    keyId: string;
  }): boolean {
    return this.signingService.verify(input);
  }
}