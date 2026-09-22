import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { SigningService } from './signing.service.js';

export type DocumentStatusValue =
  | 'PENDING'
  | 'VALID'
  | 'REVOKED'
  | 'REPLACED'
  | 'EXPIRED';

export type DocumentLifecycleEventTypeValue =
  | 'REGISTERED'
  | 'STATUS_CHANGED';

interface LifecyclePayload {
  schema: 'vera.lifecycle.v1';

  documentPublicId: string;

  sequence: number;

  type: DocumentLifecycleEventTypeValue;

  fromStatus: DocumentStatusValue | null;

  toStatus: DocumentStatusValue;

  reason: string | null;

  previousEventHash: string | null;

  occurredAt: string;
}

export interface LifecycleEventInput {
  sequence: number;

  type: DocumentLifecycleEventTypeValue;

  fromStatus: DocumentStatusValue | null;

  toStatus: DocumentStatusValue;

  reason: string | null;

  previousEventHash: string | null;

  payload: string;

  signature: string;

  algorithm: string;

  keyId: string;

  eventHash: string;

  createdAt: Date;
}

interface SignedEnvelope {
  payload: string;
  signature: string;
  algorithm: string;
  keyId: string;
}

@Injectable()
export class LifecycleService {
  constructor(
    private readonly signingService: SigningService,
  ) {}

  createRegisteredEvent(input: {
    documentPublicId: string;
    toStatus: DocumentStatusValue;
    occurredAt: string;
  }) {
    const payloadObject: LifecyclePayload = {
      schema: 'vera.lifecycle.v1',

      documentPublicId:
        input.documentPublicId,

      sequence: 1,

      type: 'REGISTERED',

      fromStatus: null,

      toStatus:
        input.toStatus,

      reason: null,

      previousEventHash: null,

      occurredAt:
        input.occurredAt,
    };

    return this.signEvent(
      payloadObject,
    );
  }

  createStatusChangedEvent(input: {
    documentPublicId: string;

    sequence: number;

    fromStatus: DocumentStatusValue;

    toStatus: DocumentStatusValue;

    reason: string;

    previousEventHash: string;

    occurredAt: string;
  }) {
    if (input.sequence < 2) {
      throw new Error(
        'STATUS_CHANGED requires sequence >= 2',
      );
    }

    if (
      input.fromStatus ===
      input.toStatus
    ) {
      throw new Error(
        'fromStatus and toStatus cannot be equal',
      );
    }

    const reason =
      input.reason.trim();

    if (!reason) {
      throw new Error(
        'A status change requires a reason',
      );
    }

    const payloadObject: LifecyclePayload = {
      schema:
        'vera.lifecycle.v1',

      documentPublicId:
        input.documentPublicId,

      sequence:
        input.sequence,

      type:
        'STATUS_CHANGED',

      fromStatus:
        input.fromStatus,

      toStatus:
        input.toStatus,

      reason,

      previousEventHash:
        input.previousEventHash,

      occurredAt:
        input.occurredAt,
    };

    return this.signEvent(
      payloadObject,
    );
  }

  private signEvent(
    payloadObject: LifecyclePayload,
  ) {
    const payload =
      JSON.stringify(
        payloadObject,
      );

    const signed =
      this.signingService.sign(
        payload,
      );

    const eventHash =
      this.calculateEventHash({
        payload,

        signature:
          signed.signature,

        algorithm:
          signed.algorithm,

        keyId:
          signed.keyId,
      });

    return {
      sequence:
        payloadObject.sequence,

      type:
        payloadObject.type,

      fromStatus:
        payloadObject.fromStatus,

      toStatus:
        payloadObject.toStatus,

      reason:
        payloadObject.reason,

      previousEventHash:
        payloadObject.previousEventHash,

      payload,

      signature:
        signed.signature,

      algorithm:
        signed.algorithm,

      keyId:
        signed.keyId,

      eventHash,
    };
  }

  calculateEventHash(
    input: SignedEnvelope,
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

  verifySignature(
    input: SignedEnvelope,
  ): boolean {
    return this.signingService.verify({
      payload:
        input.payload,

      signature:
        input.signature,

      algorithm:
        input.algorithm,

      keyId:
        input.keyId,
    });
  }

  evaluateChain(
    documentPublicId: string,

    databaseStatus:
      DocumentStatusValue,

    events:
      LifecycleEventInput[],
  ) {
    if (
      events.length === 0
    ) {
      return {
        valid:
          false,

        signaturesValid:
          false,

        eventHashesValid:
          false,

        claimsMatch:
          false,

        chainLinksValid:
          false,

        sequenceValid:
          false,

        derivedStatus:
          null as
            DocumentStatusValue |
            null,

        databaseStatusMatches:
          false,
      };
    }

    const orderedEvents =
      [...events].sort(
        (a, b) =>
          a.sequence -
          b.sequence,
      );

    let signaturesValid =
      true;

    let eventHashesValid =
      true;

    let claimsMatch =
      true;

    let chainLinksValid =
      true;

    let sequenceValid =
      true;

    for (
      let index = 0;
      index <
      orderedEvents.length;
      index += 1
    ) {
      const event =
        orderedEvents[index];

      const previousEvent =
        index > 0
          ? orderedEvents[
              index - 1
            ]
          : null;

      const expectedSequence =
        index + 1;

      if (
        event.sequence !==
        expectedSequence
      ) {
        sequenceValid =
          false;
      }

      let signatureValid =
        false;

      try {
        signatureValid =
          this.verifySignature({
            payload:
              event.payload,

            signature:
              event.signature,

            algorithm:
              event.algorithm,

            keyId:
              event.keyId,
          });
      } catch {
        signatureValid =
          false;
      }

      if (!signatureValid) {
        signaturesValid =
          false;
      }

      let calculatedEventHash:
        string | null =
          null;

      try {
        calculatedEventHash =
          this.calculateEventHash({
            payload:
              event.payload,

            signature:
              event.signature,

            algorithm:
              event.algorithm,

            keyId:
              event.keyId,
          });
      } catch {
        calculatedEventHash =
          null;
      }

      if (
        calculatedEventHash !==
        event.eventHash
      ) {
        eventHashesValid =
          false;
      }

      try {
        const payload =
          JSON.parse(
            event.payload,
          ) as LifecyclePayload;

        const currentClaimsMatch =
          payload.schema ===
            'vera.lifecycle.v1' &&

          payload.documentPublicId ===
            documentPublicId &&

          payload.sequence ===
            event.sequence &&

          payload.type ===
            event.type &&

          payload.fromStatus ===
            event.fromStatus &&

          payload.toStatus ===
            event.toStatus &&

          payload.reason ===
            event.reason &&

          payload.previousEventHash ===
            event.previousEventHash &&

          payload.occurredAt ===
            event.createdAt
              .toISOString();

        if (
          !currentClaimsMatch
        ) {
          claimsMatch =
            false;
        }
      } catch {
        claimsMatch =
          false;
      }

      if (index === 0) {
        if (
          event.sequence !== 1 ||

          event.type !==
            'REGISTERED' ||

          event.fromStatus !==
            null ||

          event.previousEventHash !==
            null
        ) {
          chainLinksValid =
            false;
        }

        continue;
      }

      if (!previousEvent) {
        chainLinksValid =
          false;

        continue;
      }

      if (
        event.type !==
        'STATUS_CHANGED'
      ) {
        chainLinksValid =
          false;
      }

      if (
        event.previousEventHash !==
        previousEvent.eventHash
      ) {
        chainLinksValid =
          false;
      }

      if (
        event.fromStatus !==
        previousEvent.toStatus
      ) {
        chainLinksValid =
          false;
      }

      if (
        event.fromStatus ===
        event.toStatus
      ) {
        chainLinksValid =
          false;
      }

      if (
        !event.reason ||
        !event.reason.trim()
      ) {
        claimsMatch =
          false;
      }
    }

    const valid =
      signaturesValid &&
      eventHashesValid &&
      claimsMatch &&
      chainLinksValid &&
      sequenceValid;

    const derivedStatus:
      DocumentStatusValue |
      null =
        valid
          ? orderedEvents[
              orderedEvents.length -
                1
            ].toStatus
          : null;

    const databaseStatusMatches =
      valid &&
      derivedStatus ===
        databaseStatus;

    return {
      valid,

      signaturesValid,

      eventHashesValid,

      claimsMatch,

      chainLinksValid,

      sequenceValid,

      derivedStatus,

      databaseStatusMatches,
    };
  }
}