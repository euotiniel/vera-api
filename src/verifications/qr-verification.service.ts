import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { QrProofService } from '../trust/qr-proof.service.js';

import { VerificationPolicyService } from './verification-policy.service.js';
import { VerificationsService } from './verifications.service.js';

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
    proofInput: string,
  ) {
    const proof =
      proofInput?.trim();

    if (!proof) {
      return this.invalidProof();
    }

    const qr =
      this.qrProofService.verify(
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
     * Só consultamos o banco depois
     * de confirmar que a assinatura
     * do QR é válida.
     */
    const document =
      await this.prisma.document
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

              take:
                1,

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

    const version =
      document.versions[0];

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
      };
    }

    /*
     * O QR submetido precisa ser
     * EXATAMENTE a prova canónica
     * persistida para esta versão.
     */
    const storedProofMatch =
      version.qrProof ===
      proof;

    /*
     * As claims do QR também precisam
     * corresponder à versão atual.
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
     * O QR v2 também está ligado à
     * Attestation específica desta versão.
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

    /*
     * Mesmo com assinatura Vera válida,
     * recusamos qualquer QR que não seja
     * a prova canónica deste registo.
     */
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
     * QR íntegro.
     *
     * Agora reutilizamos toda a
     * verificação pública já existente:
     *
     * - emissor
     * - attestation
     * - lifecycle
     * - status
     * - storage
     */
    const base =
      await this.verificationsService
        .verifyByPublicId(
          payload.publicId,
        );

    /*
     * O retorno de verifyByPublicId()
     * é uma union.
     *
     * Em erros iniciais ele pode não
     * possuir status/originalFile.
     *
     * Fazemos narrowing explícito antes
     * de usar esses campos.
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
      };
    }

    /*
     * Agora TypeScript e runtime sabem
     * que status/originalFile existem.
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