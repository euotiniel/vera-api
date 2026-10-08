import {
  Injectable,
} from '@nestjs/common';

import {
  createHash,
} from 'node:crypto';

import {
  PdfValidationService,
} from '../documents/pdf-validation.service.js';

import {
  PrismaService,
} from '../prisma/prisma.service.js';

import {
  StorageService,
} from '../storage/storage.service.js';

import {
  AttestationService,
} from '../trust/attestation.service.js';

import {
  LifecycleService,
} from '../trust/lifecycle.service.js';

import {
  isValidPublicId,
} from '../trust/public-id.js';

import {
  type DocumentStatusValue,
  VerificationPolicyService,
} from './verification-policy.service.js';

interface AttestationV2Payload {
  schema:
    'vera.attestation.v2';

  document: {
    publicId:
      string;

    title:
      string;

    type:
      string | null;

    reference:
      string | null;

    issuedAt:
      string | null;
  };

  issuer: {
    id:
      string;

    slug:
      string;

    name:
      string;
  };

  version: {
    number:
      number;

    filename:
      string;

    mimeType:
      string;

    size:
      number;

    sha256:
      string;

    registeredAt:
      string;
  };
}

interface LifecyclePayload {
  schema:
    'vera.lifecycle.v1';

  documentPublicId:
    string;

  sequence:
    number;

  type:
    | 'REGISTERED'
    | 'STATUS_CHANGED';

  fromStatus:
    | DocumentStatusValue
    | null;

  toStatus:
    DocumentStatusValue;

  reason:
    string | null;

  previousEventHash:
    string | null;

  occurredAt:
    string;
}

interface AttestationInput {
  payload:
    string;

  signature:
    string;

  algorithm:
    string;

  keyId:
    string;
}

interface VersionInput {
  version:
    number;

  filename:
    string;

  mimeType:
    string;

  size:
    number;

  sha256:
    string;

  storageKey:
    string | null;

  createdAt:
    Date;

  attestation:
    AttestationInput | null;
}

interface LifecycleEventInput {
  sequence:
    number;

  type:
    | 'REGISTERED'
    | 'STATUS_CHANGED';

  fromStatus:
    | DocumentStatusValue
    | null;

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

@Injectable()
export class VerificationsService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly attestationService:
      AttestationService,

    private readonly lifecycleService:
      LifecycleService,

    private readonly verificationPolicyService:
      VerificationPolicyService,

    private readonly storageService:
      StorageService,

    private readonly pdfValidationService:
      PdfValidationService,
  ) {}

  /*
   * ============================================================
   * VERIFY BY PUBLIC ID
   * ============================================================
   *
   * Sem requestedVersion:
   * verifica a versão corrente.
   *
   * Com requestedVersion:
   * verifica exatamente essa versão.
   * Este modo é utilizado internamente,
   * principalmente pela verificação QR.
   */

  async verifyByPublicId(
    publicId:
      string,

    requestedVersion?:
      number,
  ) {
    const normalizedPublicId =
      publicId
        .trim()
        .toUpperCase();

    const idChecksumValid =
      isValidPublicId(
        normalizedPublicId,
      );

    if (!idChecksumValid) {
      const verdict =
        this.verificationPolicyService
          .evaluate({
            method:
              'PUBLIC_ID',

            idChecksumValid:
              false,

            recordFound:
              false,
          });

      return {
        method:
          'PUBLIC_ID',

        policy:
          this.verificationPolicyService
            .policyId,

        verdict,

        publicId:
          normalizedPublicId,

        checks: {
          idChecksumValid:
            false,

          recordFound:
            false,
        },
      };
    }

    const document =
      await this.prisma
        .document
        .findUnique({
          where: {
            publicId:
              normalizedPublicId,
          },

          include: {
            organization:
              true,

            versions: {
              orderBy: {
                version:
                  'desc',
              },

              include: {
                attestation:
                  true,
              },
            },

            lifecycleEvents: {
              orderBy: {
                sequence:
                  'asc',
              },
            },
          },
        });

    if (!document) {
      const verdict =
        this.verificationPolicyService
          .evaluate({
            method:
              'PUBLIC_ID',

            idChecksumValid:
              true,

            recordFound:
              false,
          });

      return {
        method:
          'PUBLIC_ID',

        policy:
          this.verificationPolicyService
            .policyId,

        verdict,

        publicId:
          normalizedPublicId,

        checks: {
          idChecksumValid:
            true,

          recordFound:
            false,
        },
      };
    }

    const latestVersion =
      document.versions[0] ??
      null;

    const version =
      requestedVersion ===
        undefined
        ? latestVersion
        : document.versions
            .find(
              (
                candidate,
              ) =>
                candidate.version ===
                requestedVersion,
            ) ??
          null;

    /*
     * O documento existe, mas a versão
     * solicitada não existe.
     *
     * Isto é especialmente relevante para
     * QR Proofs que referenciem um número
     * de versão inexistente.
     */
    if (
      requestedVersion !==
        undefined &&
      !version
    ) {
      const verdict =
        this.verificationPolicyService
          .evaluate({
            method:
              'PUBLIC_ID',

            idChecksumValid:
              true,

            recordFound:
              false,
          });

      return {
        method:
          'PUBLIC_ID',

        policy:
          this.verificationPolicyService
            .policyId,

        verdict,

        publicId:
          document.publicId,

        checks: {
          idChecksumValid:
            true,

          recordFound:
            false,
        },

        versioning: {
          checkedVersion:
            requestedVersion,

          latestVersion:
            latestVersion
              ?.version ??
            null,

          currentVersion:
            false,
        },
      };
    }

    const attestation =
      version
        ? this.evaluateAttestation(
            {
              publicId:
                document.publicId,

              title:
                document.title,

              type:
                document.type,

              reference:
                document.reference,

              issuedAt:
                document.issuedAt,
            },

            {
              id:
                document.organization.id,

              slug:
                document.organization.slug,

              name:
                document.organization.name,
            },

            version,

            version.attestation,
          )
        : {
            valid:
              false,

            signatureValid:
              false,

            claimsMatch:
              false,
          };

    const lifecycle =
      this.evaluateLifecycle(
        document.publicId,

        document.status as
          DocumentStatusValue,

        document.lifecycleEvents as
          LifecycleEventInput[],
      );

    /*
     * Quando verificamos uma versão específica,
     * validamos os bytes dessa versão.
     *
     * PUBLIC_ID normal continua selecionando
     * a versão mais recente.
     */
    const originalFile =
      await this.evaluateOriginalFile(
        version,
      );

    const currentVersion =
      Boolean(
        version &&
        latestVersion &&
        version.version ===
          latestVersion.version,
      );

    const verdict =
      this.verificationPolicyService
        .evaluate({
          method:
            'PUBLIC_ID',

          idChecksumValid:
            true,

          recordFound:
            true,

          issuerVerified:
            document.organization
              .verified,

          attestationValid:
            attestation.valid,

          lifecycleValid:
            lifecycle.valid,

          databaseStatusMatches:
            lifecycle
              .databaseStatusMatches,

          derivedStatus:
            lifecycle
              .derivedStatus,

          originalFileRequired:
            true,

          originalFileAvailable:
            originalFile.available,

          originalFileIntegrityValid:
            originalFile
              .integrityValid,
        });

    return {
      method:
        'PUBLIC_ID',

      policy:
        this.verificationPolicyService
          .policyId,

      verdict,

      publicId:
        document.publicId,

      checks: {
        idChecksumValid:
          true,

        recordFound:
          true,

        issuerVerified:
          document.organization
            .verified,

        attestationValid:
          attestation.valid,

        lifecycleValid:
          lifecycle.valid,

        databaseStatusMatches:
          lifecycle
            .databaseStatusMatches,

        originalFileAvailable:
          originalFile.available,

        originalFileIntegrityValid:
          originalFile
            .integrityValid,
      },

      trust: {
        attestation,

        lifecycle: {
          valid:
            lifecycle.valid,

          signaturesValid:
            lifecycle
              .signaturesValid,

          eventHashesValid:
            lifecycle
              .eventHashesValid,

          claimsMatch:
            lifecycle
              .claimsMatch,

          chainLinksValid:
            lifecycle
              .chainLinksValid,

          sequenceValid:
            lifecycle
              .sequenceValid,
        },
      },

      originalFile: {
        access:
          document
            .originalFileAccess,

        stored:
          originalFile.available,

        integrityValid:
          originalFile
            .integrityValid,

        canDisplay:
          document
            .originalFileAccess ===
            'PUBLIC' &&
          originalFile.available ===
            true &&
          originalFile.integrityValid ===
            true,
      },

      status: {
        derived:
          lifecycle
            .derivedStatus,

        database:
          document.status,
      },

      versioning: {
        checkedVersion:
          version
            ?.version ??
          null,

        latestVersion:
          latestVersion
            ?.version ??
          null,

        currentVersion,
      },

      document: {
        publicId:
          document.publicId,

        title:
          document.title,

        type:
          document.type,

        reference:
          document.reference,

        issuedAt:
          document.issuedAt,

        organization: {
          name:
            document.organization
              .name,

          slug:
            document.organization
              .slug,

          verified:
            document.organization
              .verified,
        },

        version:
          version
            ? {
                version:
                  version.version,

                filename:
                  version.filename,

                mimeType:
                  version.mimeType,

                size:
                  version.size,

                registeredAt:
                  version.createdAt,
              }
            : null,
      },
    };
  }

  /*
   * ============================================================
   * VERIFY BY FILE
   * ============================================================
   */

  async verifyFile(
    file:
      Express.Multer.File,
  ) {
    /*
     * Exact Match não normaliza nem regrava
     * os bytes enviados.
     *
     * Apenas confirmamos que aparentam ser
     * um PDF antes do SHA-256.
     */
    this.pdfValidationService
      .assertPdfSignature(
        file.buffer,
      );

    const sha256 =
      createHash(
        'sha256',
      )
        .update(
          file.buffer,
        )
        .digest(
          'hex',
        );

    const version =
      await this.prisma
        .documentVersion
        .findUnique({
          where: {
            sha256,
          },

          include: {
            attestation:
              true,

            document: {
              include: {
                organization:
                  true,

                lifecycleEvents: {
                  orderBy: {
                    sequence:
                      'asc',
                  },
                },

                versions: {
                  orderBy: {
                    version:
                      'desc',
                  },

                  take:
                    1,

                  select: {
                    version:
                      true,
                  },
                },
              },
            },
          },
        });

    if (!version) {
      await this.prisma
        .verificationEvent
        .create({
          data: {
            hash:
              sha256,

            matched:
              false,
          },
        });

      const verdict =
        this.verificationPolicyService
          .evaluate({
            method:
              'FILE',

            exactMatch:
              false,

            recordFound:
              false,
          });

      return {
        method:
          'FILE',

        policy:
          this.verificationPolicyService
            .policyId,

        verdict,

        hash:
          sha256,

        exactMatch:
          false,

        checks: {
          exactMatch:
            false,

          recordFound:
            false,
        },
      };
    }

    const document =
      version.document;

    await this.prisma
      .verificationEvent
      .create({
        data: {
          hash:
            sha256,

          matched:
            true,

          documentId:
            document.id,
        },
      });

    const attestation =
      this.evaluateAttestation(
        {
          publicId:
            document.publicId,

          title:
            document.title,

          type:
            document.type,

          reference:
            document.reference,

          issuedAt:
            document.issuedAt,
        },

        {
          id:
            document.organization.id,

          slug:
            document.organization.slug,

          name:
            document.organization.name,
        },

        version,

        version.attestation,
      );

    const lifecycle =
      this.evaluateLifecycle(
        document.publicId,

        document.status as
          DocumentStatusValue,

        document.lifecycleEvents as
          LifecycleEventInput[],
      );

    const latestVersionNumber =
      document.versions[0]
        ?.version ??
      version.version;

    const currentVersion =
      version.version ===
      latestVersionNumber;

    const verdict =
      this.verificationPolicyService
        .evaluate({
          method:
            'FILE',

          exactMatch:
            true,

          recordFound:
            true,

          issuerVerified:
            document.organization
              .verified,

          attestationValid:
            attestation.valid,

          lifecycleValid:
            lifecycle.valid,

          databaseStatusMatches:
            lifecycle
              .databaseStatusMatches,

          derivedStatus:
            lifecycle
              .derivedStatus,

          originalFileRequired:
            false,
        });

    return {
      method:
        'FILE',

      policy:
        this.verificationPolicyService
          .policyId,

      verdict,

      hash:
        sha256,

      exactMatch:
        true,

      checks: {
        exactMatch:
          true,

        recordFound:
          true,

        issuerVerified:
          document.organization
            .verified,

        attestationValid:
          attestation.valid,

        lifecycleValid:
          lifecycle.valid,

        databaseStatusMatches:
          lifecycle
            .databaseStatusMatches,
      },

      trust: {
        attestation,

        lifecycle: {
          valid:
            lifecycle.valid,

          signaturesValid:
            lifecycle
              .signaturesValid,

          eventHashesValid:
            lifecycle
              .eventHashesValid,

          claimsMatch:
            lifecycle
              .claimsMatch,

          chainLinksValid:
            lifecycle
              .chainLinksValid,

          sequenceValid:
            lifecycle
              .sequenceValid,
        },
      },

      status: {
        derived:
          lifecycle
            .derivedStatus,

        database:
          document.status,
      },

      /*
       * Exact Match responde explicitamente
       * se os bytes pertencem à versão atual
       * ou a uma versão anterior legítima.
       */
      versioning: {
        checkedVersion:
          version.version,

        latestVersion:
          latestVersionNumber,

        currentVersion,
      },

      document: {
        publicId:
          document.publicId,

        title:
          document.title,

        type:
          document.type,

        reference:
          document.reference,

        issuedAt:
          document.issuedAt,

        organization: {
          name:
            document.organization
              .name,

          slug:
            document.organization
              .slug,

          verified:
            document.organization
              .verified,
        },

        version: {
          version:
            version.version,

          filename:
            version.filename,

          mimeType:
            version.mimeType,

          size:
            version.size,

          registeredAt:
            version.createdAt,
        },
      },
    };
  }

  /*
   * ============================================================
   * ATTESTATION
   * ============================================================
   */

  private evaluateAttestation(
    document: {
      publicId:
        string;

      title:
        string;

      type:
        string | null;

      reference:
        string | null;

      issuedAt:
        Date | null;
    },

    organization: {
      id:
        string;

      slug:
        string;

      name:
        string;
    },

    version: {
      version:
        number;

      filename:
        string;

      mimeType:
        string;

      size:
        number;

      sha256:
        string;

      createdAt:
        Date;
    },

    attestation:
      AttestationInput | null,
  ) {
    if (!attestation) {
      return {
        valid:
          false,

        signatureValid:
          false,

        claimsMatch:
          false,
      };
    }

    let signatureValid =
      false;

    try {
      signatureValid =
        this.attestationService
          .verify(
            attestation.payload,
            attestation.signature,
            attestation.algorithm,
            attestation.keyId,
          );
    } catch {
      signatureValid =
        false;
    }

    let claimsMatch =
      false;

    try {
      const payload =
        JSON.parse(
          attestation.payload,
        ) as
          AttestationV2Payload;

      claimsMatch =
        payload.schema ===
          'vera.attestation.v2' &&

        payload.document.publicId ===
          document.publicId &&

        payload.document.title ===
          document.title &&

        payload.document.type ===
          document.type &&

        payload.document.reference ===
          document.reference &&

        payload.document.issuedAt ===
          (
            document.issuedAt
              ?.toISOString() ??
            null
          ) &&

        payload.issuer.id ===
          organization.id &&

        payload.issuer.slug ===
          organization.slug &&

        payload.issuer.name ===
          organization.name &&

        payload.version.number ===
          version.version &&

        payload.version.filename ===
          version.filename &&

        payload.version.mimeType ===
          version.mimeType &&

        payload.version.size ===
          version.size &&

        payload.version.sha256 ===
          version.sha256 &&

        payload.version.registeredAt ===
          version.createdAt
            .toISOString();
    } catch {
      claimsMatch =
        false;
    }

    return {
      valid:
        signatureValid &&
        claimsMatch,

      signatureValid,

      claimsMatch,
    };
  }

  /*
   * ============================================================
   * ORIGINAL FILE
   * ============================================================
   */

  private async evaluateOriginalFile(
    version:
      VersionInput | null,
  ) {
    if (
      !version ||
      !version.storageKey
    ) {
      return {
        available:
          false,

        integrityValid:
          false,
      };
    }

    try {
      const storedFile =
        await this.storageService
          .getFile(
            version.storageKey,
          );

      const storedSha256 =
        createHash(
          'sha256',
        )
          .update(
            storedFile.body,
          )
          .digest(
            'hex',
          );

      const integrityValid =
        storedSha256 ===
          version.sha256 &&

        storedFile.body.length ===
          version.size;

      return {
        available:
          true,

        integrityValid,
      };
    } catch {
      return {
        available:
          false,

        integrityValid:
          false,
      };
    }
  }

  /*
   * ============================================================
   * LIFECYCLE
   * ============================================================
   */

  private evaluateLifecycle(
    documentPublicId:
      string,

    databaseStatus:
      DocumentStatusValue,

    events:
      LifecycleEventInput[],
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

        derivedStatus:
          null as
            | DocumentStatusValue
            | null,

        databaseStatusMatches:
          false,
      };
    }

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
      index < events.length;
      index += 1
    ) {
      const event =
        events[index];

      const previousEvent =
        index > 0
          ? events[index - 1]
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
          this.lifecycleService
            .verifySignature({
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
          this.lifecycleService
            .calculateEventHash({
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
          ) as
            LifecyclePayload;

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
    }

    const valid =
      signaturesValid &&
      eventHashesValid &&
      claimsMatch &&
      chainLinksValid &&
      sequenceValid;

    const derivedStatus:
      DocumentStatusValue | null =
      valid
        ? events[
            events.length - 1
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