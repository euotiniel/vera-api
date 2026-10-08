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
  type DocumentStatusValue,
  type LifecycleEventInput,
  LifecycleService,
} from '../trust/lifecycle.service.js';

import {
  isValidPublicId,
} from '../trust/public-id.js';

import {
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

    if (
      !idChecksumValid
    ) {
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

            replacedBy: {
              select: {
                publicId:
                  true,

                title:
                  true,

                type:
                  true,

                reference:
                  true,

                status:
                  true,

                issuedAt:
                  true,

                createdAt:
                  true,
              },
            },

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

    if (
      !document
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
      this.lifecycleService
        .evaluateChain(
          document.publicId,

          document.status as
            DocumentStatusValue,

          document.lifecycleEvents as
            LifecycleEventInput[],

          document.replacedBy
            ?.publicId ??
            null,
        );

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

        replacementBindingValid:
          lifecycle
            .replacementBindingValid,

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

          replacementBindingValid:
            lifecycle
              .replacementBindingValid,
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

      replacement:
        document.replacedBy
          ? {
              publicId:
                document
                  .replacedBy
                  .publicId,

              title:
                document
                  .replacedBy
                  .title,

              type:
                document
                  .replacedBy
                  .type,

              reference:
                document
                  .replacedBy
                  .reference,

              status:
                document
                  .replacedBy
                  .status,

              issuedAt:
                document
                  .replacedBy
                  .issuedAt,

              registeredAt:
                document
                  .replacedBy
                  .createdAt,
            }
          : null,

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

  async verifyFile(
    file:
      Express.Multer.File,
  ) {
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

                replacedBy: {
                  select: {
                    publicId:
                      true,

                    title:
                      true,

                    type:
                      true,

                    reference:
                      true,

                    status:
                      true,

                    issuedAt:
                      true,

                    createdAt:
                      true,
                  },
                },

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

    if (
      !version
    ) {
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
      this.lifecycleService
        .evaluateChain(
          document.publicId,

          document.status as
            DocumentStatusValue,

          document.lifecycleEvents as
            LifecycleEventInput[],

          document.replacedBy
            ?.publicId ??
            null,
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

        replacementBindingValid:
          lifecycle
            .replacementBindingValid,
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

          replacementBindingValid:
            lifecycle
              .replacementBindingValid,
        },
      },

      status: {
        derived:
          lifecycle
            .derivedStatus,

        database:
          document.status,
      },

      replacement:
        document.replacedBy
          ? {
              publicId:
                document
                  .replacedBy
                  .publicId,

              title:
                document
                  .replacedBy
                  .title,

              type:
                document
                  .replacedBy
                  .type,

              reference:
                document
                  .replacedBy
                  .reference,

              status:
                document
                  .replacedBy
                  .status,

              issuedAt:
                document
                  .replacedBy
                  .issuedAt,

              registeredAt:
                document
                  .replacedBy
                  .createdAt,
            }
          : null,

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
    if (
      !attestation
    ) {
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
}