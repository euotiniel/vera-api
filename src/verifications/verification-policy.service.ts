import { Injectable } from '@nestjs/common';

export type VerificationMethod =
  | 'PUBLIC_ID'
  | 'FILE'
  | 'QR';

export type DocumentStatusValue =
  | 'PENDING'
  | 'VALID'
  | 'REVOKED'
  | 'REPLACED'
  | 'EXPIRED';

export type VerificationVerdictCode =
  | 'VERIFIED'
  | 'PENDING'
  | 'REVOKED'
  | 'EXPIRED'
  | 'REPLACED'
  | 'INVALID_IDENTIFIER'
  | 'NOT_FOUND'
  | 'NO_EXACT_MATCH'
  | 'ISSUER_UNVERIFIED'
  | 'TRUST_FAILURE'
  | 'LIFECYCLE_FAILURE'
  | 'INCONSISTENT_RECORD'
  | 'ORIGINAL_FILE_UNAVAILABLE'
  | 'ORIGINAL_FILE_INTEGRITY_FAILURE'
  | 'INVALID_QR_PROOF'
  | 'QR_PROOF_MISMATCH';

export interface VerificationVerdict {
  code:
    VerificationVerdictCode;

  verified:
    boolean;

  message:
    string;
}

interface VerificationPolicyInput {
  method:
    VerificationMethod;

  idChecksumValid?:
    boolean | null;

  qrProofValid?:
    boolean | null;

  qrStoredProofMatch?:
    boolean | null;

  qrClaimsMatch?:
    boolean | null;

  qrAttestationBindingValid?:
    boolean | null;

  recordFound:
    boolean;

  exactMatch?:
    boolean | null;

  issuerVerified?:
    boolean | null;

  attestationValid?:
    boolean | null;

  lifecycleValid?:
    boolean | null;

  databaseStatusMatches?:
    boolean | null;

  derivedStatus?:
    DocumentStatusValue |
    null;

  originalFileRequired?:
    boolean;

  originalFileAvailable?:
    boolean | null;

  originalFileIntegrityValid?:
    boolean | null;
}

@Injectable()
export class VerificationPolicyService {
  readonly policyId =
    'vera.public-verification.v4';

  evaluate(
    input:
      VerificationPolicyInput,
  ): VerificationVerdict {
    if (
      input.method ===
        'QR' &&
      input.qrProofValid !==
        true
    ) {
      return {
        code:
          'INVALID_QR_PROOF',

        verified:
          false,

        message:
          'A prova criptográfica do QR é inválida.',
      };
    }

    if (
      input.method ===
        'PUBLIC_ID' &&
      input.idChecksumValid !==
        true
    ) {
      return {
        code:
          'INVALID_IDENTIFIER',

        verified:
          false,

        message:
          'O identificador Vera é inválido.',
      };
    }

    if (
      input.method ===
        'FILE' &&
      input.exactMatch !==
        true
    ) {
      return {
        code:
          'NO_EXACT_MATCH',

        verified:
          false,

        message:
          'O ficheiro não corresponde exatamente a uma versão registada na Vera.',
      };
    }

    /*
     * Só avaliamos binding do QR
     * depois de sabermos que o registo
     * realmente existe.
     */
    if (!input.recordFound) {
      return {
        code:
          'NOT_FOUND',

        verified:
          false,

        message:
          'Não foi encontrado um registo Vera correspondente.',
      };
    }

    if (
      input.method ===
        'QR' &&
      (
        input.qrStoredProofMatch !==
          true ||
        input.qrClaimsMatch !==
          true ||
        input.qrAttestationBindingValid !==
          true
      )
    ) {
      return {
        code:
          'QR_PROOF_MISMATCH',

        verified:
          false,

        message:
          'O QR é criptograficamente assinado, mas não corresponde à prova canónica registada para esta versão.',
      };
    }

    if (
      input.issuerVerified !==
        true
    ) {
      return {
        code:
          'ISSUER_UNVERIFIED',

        verified:
          false,

        message:
          'A identidade do emissor não pôde ser confirmada.',
      };
    }

    if (
      input.attestationValid !==
        true
    ) {
      return {
        code:
          'TRUST_FAILURE',

        verified:
          false,

        message:
          'A prova criptográfica do documento não pôde ser validada.',
      };
    }

    if (
      input.lifecycleValid !==
        true
    ) {
      return {
        code:
          'LIFECYCLE_FAILURE',

        verified:
          false,

        message:
          'A cadeia de estado do documento não pôde ser validada.',
      };
    }

    if (
      input.databaseStatusMatches !==
        true
    ) {
      return {
        code:
          'INCONSISTENT_RECORD',

        verified:
          false,

        message:
          'As provas assinadas e o estado atual do registo estão inconsistentes.',
      };
    }

    switch (
      input.derivedStatus
    ) {
      case 'PENDING':
        return {
          code:
            'PENDING',

          verified:
            false,

          message:
            'O documento está pendente de validação.',
        };

      case 'REVOKED':
        return {
          code:
            'REVOKED',

          verified:
            false,

          message:
            'O documento foi revogado.',
        };

      case 'EXPIRED':
        return {
          code:
            'EXPIRED',

          verified:
            false,

          message:
            'O documento expirou.',
        };

      case 'REPLACED':
        return {
          code:
            'REPLACED',

          verified:
            false,

          message:
            'O documento foi substituído por uma versão posterior.',
        };

      case 'VALID':
        break;

      default:
        return {
          code:
            'LIFECYCLE_FAILURE',

          verified:
            false,

          message:
            'Não foi possível determinar o estado atual do documento.',
        };
    }

    if (
      input.originalFileRequired ===
        true
    ) {
      if (
        input.originalFileAvailable !==
          true
      ) {
        return {
          code:
            'ORIGINAL_FILE_UNAVAILABLE',

          verified:
            false,

          message:
            'O documento original registado não está disponível para confirmação.',
        };
      }

      if (
        input.originalFileIntegrityValid !==
          true
      ) {
        return {
          code:
            'ORIGINAL_FILE_INTEGRITY_FAILURE',

          verified:
            false,

          message:
            'A integridade do documento original armazenado não pôde ser confirmada.',
        };
      }
    }

    return {
      code:
        'VERIFIED',

      verified:
        true,

      message:
        'Documento verificado e atualmente válido.',
    };
  }
}