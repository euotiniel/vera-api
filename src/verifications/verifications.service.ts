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

type OriginalFileAccessValue =
  | 'PUBLIC'
  | 'RESTRICTED'
  | 'PRIVATE';

interface AttestationV2Payload {
  schema:
    'vera.attestation.v2';

  document: {
    publicId: string;

    title: string;

    type:
      | string
      | null;

    reference:
      | string
      | null;

    issuedAt:
      | string
      | null;
  };

  issuer: {
    id: string;

    slug: string;

    name: string;
  };

  version: {
    number: number;

    filename: string;

    mimeType: string;

    size: number;

    sha256: string;

    registeredAt: string;
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
    | string
    | null;

  previousEventHash:
    | string
    | null;

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
    | string
    | null;

  createdAt:
    Date;

  attestation:
    | AttestationInput
    | null;
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
    | string
    | null;

  previousEventHash:
    | string
    | null;

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
   */

  async verifyByPublicId(
    publicId: string,
  ) {
    const normalizedPublicId =
      publicId
        .trim()
        .toUpperCase();

    /*
     * Checksum antes de qualquer
     * consulta à base de dados.
     */
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

    /*
     * Para PUBLIC_ID usamos a versão
     * mais recente do documento.
     */
    const document =
      await this.prisma.document
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

    const version =
      document.versions[0] ??
      null;

    /*
     * Avaliação da Attestation.
     */
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

    /*
     * Avaliação da cadeia assinada
     * de lifecycle.
     */
    const lifecycle =
      this.evaluateLifecycle(
        document.publicId,

        document.status as
          DocumentStatusValue,

        document.lifecycleEvents as
          LifecycleEventInput[],
      );

    /*
     * Verificação real dos bytes
     * armazenados.
     *
     * O nível PUBLIC/PRIVATE não
     * desativa esta verificação.
     */
    const originalFile =
      await this.evaluateOriginalFile(
        document.versions as
          VersionInput[],
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
          document.originalFileAccess,

        stored:
          originalFile.available,

        integrityValid:
          originalFile
            .integrityValid,

        canDisplay:
          document.originalFileAccess ===
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
     * Não confiamos no MIME declarado
     * pelo cliente.
     *
     * Exact Match não precisa executar
     * todo o parser estrutural.
     *
     * Apenas confirmamos que os bytes
     * se apresentam como PDF antes de
     * calcular o SHA-256.
     */
    this.pdfValidationService
      .assertPdfSignature(
        file.buffer,
      );

    /*
     * Hash dos bytes EXATAMENTE como
     * foram recebidos.
     *
     * Não:
     *
     * - regravamos
     * - sanitizamos
     * - normalizamos
     * - alteramos o PDF
     */
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

    /*
     * sha256 é unique em
     * DocumentVersion.
     */
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
              },
            },
          },
        });

    /*
     * Nenhum conjunto idêntico
     * de bytes registado.
     */
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

    /*
     * Registo de auditoria da tentativa
     * de verificação.
     */
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

    /*
     * FILE não depende do object storage.
     *
     * Os próprios bytes enviados pelo
     * utilizador já foram comparados
     * diretamente pelo SHA-256.
     */
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
        | string
        | null;

      reference:
        | string
        | null;

      issuedAt:
        | Date
        | null;
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
      | AttestationInput
      | null,
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
    versions:
      VersionInput[],
  ) {
    /*
     * PUBLIC_ID sempre usa
     * a versão mais recente.
     *
     * As versões já chegam
     * ordenadas desc pelo Prisma.
     */
    const version =
      versions[0];

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
      /*
       * A Vera lê os bytes reais
       * do object storage.
       */
      const storedFile =
        await this.storageService
          .getFile(
            version.storageKey,
          );

      /*
       * Hash calculado no momento
       * da verificação.
       */
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
      /*
       * Storage fora do ar,
       * objecto apagado,
       * key inexistente etc.
       */
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
    /*
     * Documento sem lifecycle
     * não satisfaz a política atual.
     */
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

      /*
       * Sequência monotónica:
       *
       * 1, 2, 3, ...
       */
      const expectedSequence =
        index + 1;

      if (
        event.sequence !==
        expectedSequence
      ) {
        sequenceValid =
          false;
      }

      /*
       * Assinatura Ed25519.
       */
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

      if (
        !signatureValid
      ) {
        signaturesValid =
          false;
      }

      /*
       * Hash do envelope
       * do evento.
       */
      let calculatedEventHash:
        | string
        | null =
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

      /*
       * Claims assinadas precisam
       * corresponder exatamente
       * ao registo materializado.
       */
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

      /*
       * Primeiro evento.
       */
      if (
        index === 0
      ) {
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

      /*
       * Eventos posteriores precisam
       * encadear corretamente
       * o anterior.
       */
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

    /*
     * Só derivamos o estado quando
     * TODA a cadeia é válida.
     */
    const derivedStatus:
      | DocumentStatusValue
      | null =
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