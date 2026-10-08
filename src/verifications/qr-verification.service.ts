import {
  Injectable,
} from '@nestjs/common';

import {
  PrismaService,
} from '../prisma/prisma.service.js';

import {
  QrProofService,
} from '../trust/qr-proof.service.js';

import {
  VerificationPolicyService,
} from './verification-policy.service.js';

import {
  VerificationsService,
} from './verifications.service.js';

@Injectable()
export class QrVerificationService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly qrProofService:
      QrProofService,

    private readonly verificationPolicyService:
      VerificationPolicyService,

    private readonly verificationsService:
      VerificationsService,
  ) {}

  async verify(
    proofInput:
      string,
  ) {
    const proof =
      proofInput
        ?.trim();

    if (!proof) {
      return this.invalidProof();
    }

    /*
     * ============================================================
     * CRYPTOGRAPHIC QR VERIFICATION
     * ============================================================
     */

    const qr =
      this.qrProofService
        .verify(
          proof,
        );

    if (
      !qr.valid ||
      !qr.payload
    ) {
      return {
        method:
          'QR',

        policy:
          this.verificationPolicyService
            .policyId,

        verdict:
          this.verificationPolicyService
            .evaluate({
              method:
                'QR',

              qrProofValid:
                false,

              recordFound:
                false,
            }),

        checks: {
          qrStructureValid:
            qr.structureValid,

          qrSignatureValid:
            qr.signatureValid,

          qrProofValid:
            false,
        },

        qr: {
          valid:
            false,

          structureValid:
            qr.structureValid,

          signatureValid:
            qr.signatureValid,

          keyId:
            qr.keyId,
        },
      };
    }

    const payload =
      qr.payload;

    /*
     * ============================================================
     * DOCUMENT + VERSION
     * ============================================================
     *
     * Um QR Vera está ligado a uma versão
     * específica.
     *
     * Não usamos apenas a versão mais recente.
     *
     * Assim:
     *
     * QR v1 continua verificável depois de v2.
     * QR v2 continua verificável depois de v3.
     */

    const document =
      await this.prisma
        .document
        .findUnique({
          where: {
            publicId:
              payload.publicId,
          },

          include: {
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
          },
        });

    if (!document) {
      return {
        method:
          'QR',

        policy:
          this.verificationPolicyService
            .policyId,

        verdict:
          this.verificationPolicyService
            .evaluate({
              method:
                'QR',

              qrProofValid:
                true,

              recordFound:
                false,
            }),

        publicId:
          payload.publicId,

        checks: {
          qrStructureValid:
            true,

          qrSignatureValid:
            true,

          qrProofValid:
            true,

          recordFound:
            false,
        },

        qr: {
          valid:
            true,

          structureValid:
            true,

          signatureValid:
            true,

          keyId:
            qr.keyId,

          payload,
        },
      };
    }

    const latestVersion =
      document.versions[0] ??
      null;

    /*
     * Procuramos EXATAMENTE a versão
     * declarada no QR Proof.
     */
    const version =
      document.versions
        .find(
          (
            candidate,
          ) =>
            candidate.version ===
            payload.version,
        ) ??
      null;

    if (!version) {
      return {
        method:
          'QR',

        policy:
          this.verificationPolicyService
            .policyId,

        verdict:
          this.verificationPolicyService
            .evaluate({
              method:
                'QR',

              qrProofValid:
                true,

              recordFound:
                false,
            }),

        publicId:
          payload.publicId,

        checks: {
          qrStructureValid:
            true,

          qrSignatureValid:
            true,

          qrProofValid:
            true,

          recordFound:
            false,
        },

        versioning: {
          checkedVersion:
            payload.version,

          latestVersion:
            latestVersion
              ?.version ??
            null,

          currentVersion:
            false,
        },

        qr: {
          valid:
            true,

          structureValid:
            true,

          signatureValid:
            true,

          keyId:
            qr.keyId,

          payload,
        },
      };
    }

    /*
     * ============================================================
     * CANONICAL PROOF
     * ============================================================
     *
     * O token recebido precisa ser exatamente
     * o QR Proof persistido para ESTA versão.
     */

    const storedProofMatch =
      version.qrProof ===
      proof;

    /*
     * As claims assinadas também precisam
     * corresponder exatamente ao registo
     * materializado desta versão.
     */

    const claimsMatch =
      payload.publicId ===
        document.publicId &&

      payload.version ===
        version.version &&

      payload.sha256 ===
        version.sha256 &&

      payload.registeredAt ===
        version.createdAt
          .toISOString();

    /*
     * O QR v2 está criptograficamente ligado
     * à Attestation da mesma DocumentVersion.
     */

    const attestationBindingValid =
      version.attestation
        ? payload
            .attestationHash ===
          this.qrProofService
            .calculateAttestationHash({
              payload:
                version.attestation
                  .payload,

              signature:
                version.attestation
                  .signature,

              algorithm:
                version.attestation
                  .algorithm,

              keyId:
                version.attestation
                  .keyId,
            })
        : false;

    if (
      !storedProofMatch ||
      !claimsMatch ||
      !attestationBindingValid
    ) {
      return {
        method:
          'QR',

        policy:
          this.verificationPolicyService
            .policyId,

        verdict:
          this.verificationPolicyService
            .evaluate({
              method:
                'QR',

              qrProofValid:
                true,

              recordFound:
                true,

              qrStoredProofMatch:
                storedProofMatch,

              qrClaimsMatch:
                claimsMatch,

              qrAttestationBindingValid:
                attestationBindingValid,
            }),

        publicId:
          payload.publicId,

        checks: {
          qrStructureValid:
            true,

          qrSignatureValid:
            true,

          qrProofValid:
            true,

          recordFound:
            true,

          qrStoredProofMatch:
            storedProofMatch,

          qrClaimsMatch:
            claimsMatch,

          qrAttestationBindingValid:
            attestationBindingValid,
        },

        versioning: {
          checkedVersion:
            version.version,

          latestVersion:
            latestVersion
              ?.version ??
            version.version,

          currentVersion:
            latestVersion
              ? version.version ===
                latestVersion.version
              : true,
        },

        qr: {
          valid:
            true,

          structureValid:
            true,

          signatureValid:
            true,

          storedProofMatch,

          claimsMatch,

          attestationBindingValid,

          keyId:
            qr.keyId,

          payload,
        },
      };
    }

    /*
     * ============================================================
     * FULL PUBLIC VERIFICATION
     * ============================================================
     *
     * Reutilizamos a verificação pública,
     * mas explicitamente para a versão
     * declarada no QR.
     *
     * Isto é o ponto que permite verificar
     * corretamente QR Proofs históricos.
     */

    const base =
      await this
        .verificationsService
        .verifyByPublicId(
          payload.publicId,
          payload.version,
        );

    /*
     * verifyByPublicId() possui retornos
     * iniciais que podem não conter
     * status/originalFile.
     */

    const baseStatus =
      'status' in base
        ? base.status
        : undefined;

    const baseOriginalFile =
      'originalFile' in base
        ? base.originalFile
        : undefined;

    if (
      !baseStatus ||
      !baseOriginalFile
    ) {
      return {
        ...base,

        method:
          'QR',

        policy:
          this.verificationPolicyService
            .policyId,

        verdict:
          this.verificationPolicyService
            .evaluate({
              method:
                'QR',

              qrProofValid:
                true,

              recordFound:
                false,
            }),

        qr: {
          valid:
            true,

          structureValid:
            true,

          signatureValid:
            true,

          storedProofMatch:
            true,

          claimsMatch:
            true,

          attestationBindingValid:
            true,

          keyId:
            qr.keyId,

          payload,
        },
      };
    }

    /*
     * ============================================================
     * FINAL QR POLICY
     * ============================================================
     */

    const verdict =
      this.verificationPolicyService
        .evaluate({
          method:
            'QR',

          qrProofValid:
            true,

          recordFound:
            true,

          qrStoredProofMatch:
            true,

          qrClaimsMatch:
            true,

          qrAttestationBindingValid:
            true,

          issuerVerified:
            base.checks
              .issuerVerified,

          attestationValid:
            base.checks
              .attestationValid,

          lifecycleValid:
            base.checks
              .lifecycleValid,

          databaseStatusMatches:
            base.checks
              .databaseStatusMatches,

          derivedStatus:
            baseStatus.derived,

          originalFileRequired:
            true,

          originalFileAvailable:
            base.checks
              .originalFileAvailable,

          originalFileIntegrityValid:
            base.checks
              .originalFileIntegrityValid,
        });

    return {
      ...base,

      method:
        'QR',

      policy:
        this.verificationPolicyService
          .policyId,

      verdict,

      checks: {
        qrStructureValid:
          true,

        qrSignatureValid:
          true,

        qrProofValid:
          true,

        qrStoredProofMatch:
          true,

        qrClaimsMatch:
          true,

        qrAttestationBindingValid:
          true,

        ...base.checks,
      },

      qr: {
        valid:
          true,

        structureValid:
          true,

        signatureValid:
          true,

        storedProofMatch:
          true,

        claimsMatch:
          true,

        attestationBindingValid:
          true,

        keyId:
          qr.keyId,

        payload,
      },
    };
  }

  private invalidProof() {
    return {
      method:
        'QR',

      policy:
        this.verificationPolicyService
          .policyId,

      verdict:
        this.verificationPolicyService
          .evaluate({
            method:
              'QR',

            qrProofValid:
              false,

            recordFound:
              false,
          }),

      checks: {
        qrStructureValid:
          false,

        qrSignatureValid:
          false,

        qrProofValid:
          false,
      },

      qr: {
        valid:
          false,

        structureValid:
          false,

        signatureValid:
          false,

        keyId:
          null,
      },
    };
  }
}