import {
  Injectable,
} from '@nestjs/common';

import {
  createHash,
} from 'node:crypto';

import {
  isValidPublicId,
} from './public-id.js';

import {
  SigningService,
} from './signing.service.js';

export type DocumentStatusValue =
  | 'PENDING'
  | 'VALID'
  | 'REVOKED'
  | 'REPLACED'
  | 'EXPIRED';

export type DocumentLifecycleEventTypeValue =
  | 'REGISTERED'
  | 'STATUS_CHANGED';

interface LifecyclePayloadBase {
  documentPublicId:
    string;

  sequence:
    number;

  type:
    DocumentLifecycleEventTypeValue;

  fromStatus:
    DocumentStatusValue | null;

  toStatus:
    DocumentStatusValue;

  reason:
    string | null;

  previousEventHash:
    string | null;

  occurredAt:
    string;
}

/**
 * Lifecycle histórico.
 *
 * Mantemos v1 intacto para todos os
 * eventos já emitidos.
 */
interface LifecyclePayloadV1
  extends LifecyclePayloadBase {
  schema:
    'vera.lifecycle.v1';
}

/**
 * v2 existe especificamente para eventos
 * que precisam transportar informação
 * adicional criptograficamente vinculada.
 *
 * Primeiro caso:
 * Document A foi substituído por Document B.
 */
interface LifecyclePayloadV2
  extends LifecyclePayloadBase {
  schema:
    'vera.lifecycle.v2';

  replacementPublicId:
    string;
}

type LifecyclePayload =
  | LifecyclePayloadV1
  | LifecyclePayloadV2;

interface ParsedLifecyclePayload {
  schema?:
    unknown;

  documentPublicId?:
    unknown;

  sequence?:
    unknown;

  type?:
    unknown;

  fromStatus?:
    unknown;

  toStatus?:
    unknown;

  reason?:
    unknown;

  previousEventHash?:
    unknown;

  occurredAt?:
    unknown;

  replacementPublicId?:
    unknown;
}

export interface LifecycleEventInput {
  sequence:
    number;

  type:
    DocumentLifecycleEventTypeValue;

  fromStatus:
    DocumentStatusValue | null;

  toStatus:
    DocumentStatusValue;

  reason:
    string | null;

  previousEventHash:
    string | null;

  payload:
    string;

  signature:
    string;

  algorithm:
    string;

  keyId:
    string;

  eventHash:
    string;

  createdAt:
    Date;
}

interface SignedEnvelope {
  payload:
    string;

  signature:
    string;

  algorithm:
    string;

  keyId:
    string;
}

@Injectable()
export class LifecycleService {
  constructor(
    private readonly signingService:
      SigningService,
  ) {}

  /*
   * ============================================================
   * REGISTERED — v1
   * ============================================================
   */

  createRegisteredEvent(
    input: {
      documentPublicId:
        string;

      toStatus:
        DocumentStatusValue;

      occurredAt:
        string;
    },
  ) {
    const payloadObject:
      LifecyclePayloadV1 = {
        schema:
          'vera.lifecycle.v1',

        documentPublicId:
          input.documentPublicId,

        sequence:
          1,

        type:
          'REGISTERED',

        fromStatus:
          null,

        toStatus:
          input.toStatus,

        reason:
          null,

        previousEventHash:
          null,

        occurredAt:
          input.occurredAt,
      };

    return this.signEvent(
      payloadObject,
    );
  }

  /*
   * ============================================================
   * GENERIC STATUS CHANGE — v1
   * ============================================================
   *
   * REPLACED não passa por este método.
   */

  createStatusChangedEvent(
    input: {
      documentPublicId:
        string;

      sequence:
        number;

      fromStatus:
        DocumentStatusValue;

      toStatus:
        DocumentStatusValue;

      reason:
        string;

      previousEventHash:
        string;

      occurredAt:
        string;
    },
  ) {
    if (
      input.sequence <
      2
    ) {
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

    if (
      input.toStatus ===
      'REPLACED'
    ) {
      throw new Error(
        'REPLACED requires a cryptographically bound replacement document.',
      );
    }

    const reason =
      input.reason.trim();

    if (!reason) {
      throw new Error(
        'A status change requires a reason',
      );
    }

    const payloadObject:
      LifecyclePayloadV1 = {
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

  /*
   * ============================================================
   * REPLACEMENT — v2
   * ============================================================
   *
   * O Public ID do sucessor passa a fazer
   * parte do payload assinado.
   *
   * Assim a relação:
   *
   * A → B
   *
   * não depende apenas de uma coluna
   * mutável da base de dados.
   */

  createReplacementEvent(
    input: {
      documentPublicId:
        string;

      replacementPublicId:
        string;

      sequence:
        number;

      fromStatus:
        DocumentStatusValue;

      reason:
        string;

      previousEventHash:
        string;

      occurredAt:
        string;
    },
  ) {
    const documentPublicId =
      input.documentPublicId
        .trim()
        .toUpperCase();

    const replacementPublicId =
      input.replacementPublicId
        .trim()
        .toUpperCase();

    if (
      input.sequence <
      2
    ) {
      throw new Error(
        'REPLACED requires sequence >= 2',
      );
    }

    if (
      input.fromStatus !==
      'VALID'
    ) {
      throw new Error(
        'Only VALID documents can be replaced.',
      );
    }

    if (
      !isValidPublicId(
        documentPublicId,
      ) ||
      !isValidPublicId(
        replacementPublicId,
      )
    ) {
      throw new Error(
        'Invalid Vera public ID in replacement event.',
      );
    }

    if (
      documentPublicId ===
      replacementPublicId
    ) {
      throw new Error(
        'A document cannot replace itself.',
      );
    }

    const reason =
      input.reason.trim();

    if (!reason) {
      throw new Error(
        'A replacement requires a reason',
      );
    }

    const payloadObject:
      LifecyclePayloadV2 = {
        schema:
          'vera.lifecycle.v2',

        documentPublicId,

        sequence:
          input.sequence,

        type:
          'STATUS_CHANGED',

        fromStatus:
          input.fromStatus,

        toStatus:
          'REPLACED',

        reason,

        previousEventHash:
          input.previousEventHash,

        occurredAt:
          input.occurredAt,

        replacementPublicId,
      };

    return this.signEvent(
      payloadObject,
    );
  }

  /*
   * ============================================================
   * SIGNING
   * ============================================================
   */

  private signEvent(
    payloadObject:
      LifecyclePayload,
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
        payloadObject
          .previousEventHash,

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

  /*
   * ============================================================
   * HASH / SIGNATURE
   * ============================================================
   */

  calculateEventHash(
    input:
      SignedEnvelope,
  ): string {
    return createHash(
      'sha256',
    )
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
      .digest(
        'hex',
      );
  }

  verifySignature(
    input:
      SignedEnvelope,
  ): boolean {
    return this.signingService
      .verify({
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

  /*
   * ============================================================
   * CHAIN EVALUATION
   * ============================================================
   *
   * expectedReplacementPublicId liga:
   *
   * estado materializado do Document
   *
   *              +
   *
   * relação Document.replacedBy
   *
   *              +
   *
   * lifecycle criptograficamente assinado.
   */

  evaluateChain(
    documentPublicId:
      string,

    databaseStatus:
      DocumentStatusValue,

    events:
      LifecycleEventInput[],

    expectedReplacementPublicId:
      string | null =
      null,
  ) {
    if (
      events.length ===
      0
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

        replacementBindingValid:
          false,

        derivedStatus:
          null as
            | DocumentStatusValue
            | null,

        databaseStatusMatches:
          false,
      };
    }

    const orderedEvents =
      [...events]
        .sort(
          (
            a,
            b,
          ) =>
            a.sequence -
            b.sequence,
        );

    const normalizedExpectedReplacement =
      expectedReplacementPublicId
        ?.trim()
        .toUpperCase() ??
      null;

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

    let replacementBindingValid =
      true;

    for (
      let index =
        0;
      index <
      orderedEvents.length;
      index +=
        1
    ) {
      const event =
        orderedEvents[index];

      const previousEvent =
        index >
        0
          ? orderedEvents[
              index -
              1
            ]
          : null;

      const expectedSequence =
        index +
        1;

      if (
        event.sequence !==
        expectedSequence
      ) {
        sequenceValid =
          false;
      }

      /*
       * Signature.
       */

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

      if (
        !signatureValid
      ) {
        signaturesValid =
          false;
      }

      /*
       * Event hash.
       */

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

      /*
       * Signed claims.
       */

      try {
        const payload =
          JSON.parse(
            event.payload,
          ) as
            ParsedLifecyclePayload;

        const commonClaimsMatch =
          (
            payload.schema ===
              'vera.lifecycle.v1' ||
            payload.schema ===
              'vera.lifecycle.v2'
          ) &&
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
          !commonClaimsMatch
        ) {
          claimsMatch =
            false;
        }

        /*
         * Um evento REPLACED tem de ser v2
         * e apontar exatamente para o
         * sucessor materializado.
         */

        if (
          event.toStatus ===
          'REPLACED'
        ) {
          const replacementClaimsMatch =
            payload.schema ===
              'vera.lifecycle.v2' &&
            typeof payload
              .replacementPublicId ===
              'string' &&
            normalizedExpectedReplacement !==
              null &&
            payload
              .replacementPublicId ===
              normalizedExpectedReplacement;

          if (
            !replacementClaimsMatch
          ) {
            replacementBindingValid =
              false;
          }
        } else if (
          payload.schema !==
          'vera.lifecycle.v1'
        ) {
          /*
           * Neste desenho, v2 só é válido
           * para REPLACED.
           */
          claimsMatch =
            false;
        }
      } catch {
        claimsMatch =
          false;
      }

      /*
       * Chain structure.
       */

      if (
        index ===
        0
      ) {
        if (
          event.sequence !==
            1 ||
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

      if (
        !previousEvent
      ) {
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
        previousEvent
          .eventHash
      ) {
        chainLinksValid =
          false;
      }

      if (
        event.fromStatus !==
        previousEvent
          .toStatus
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

      /*
       * REPLACED é terminal.
       */

      if (
        previousEvent
          .toStatus ===
        'REPLACED'
      ) {
        chainLinksValid =
          false;
      }
    }

    const candidateStatus =
      orderedEvents[
        orderedEvents.length -
        1
      ].toStatus;

    /*
     * Se a relação materializada existe,
     * o estado também precisa ser REPLACED.
     *
     * E se o estado é REPLACED, a relação
     * precisa existir.
     */

    if (
      candidateStatus ===
        'REPLACED' &&
      normalizedExpectedReplacement ===
        null
    ) {
      replacementBindingValid =
        false;
    }

    if (
      candidateStatus !==
        'REPLACED' &&
      normalizedExpectedReplacement !==
        null
    ) {
      replacementBindingValid =
        false;
    }

    const valid =
      signaturesValid &&
      eventHashesValid &&
      claimsMatch &&
      chainLinksValid &&
      sequenceValid &&
      replacementBindingValid;

    const derivedStatus:
      DocumentStatusValue | null =
      valid
        ? candidateStatus
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

      replacementBindingValid,

      derivedStatus,

      databaseStatusMatches,
    };
  }
}