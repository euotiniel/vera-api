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
  | 'ORIGINAL_FILE_INTEGRITY_FAILURE';

export interface VerificationVerdict {
  code: VerificationVerdictCode;
  verified: boolean;
  message: string;
}

interface VerificationPolicyInput {
  method: VerificationMethod;

  idChecksumValid?: boolean | null;

  recordFound: boolean;

  exactMatch?: boolean | null;

  issuerVerified?: boolean | null;

  attestationValid?: boolean | null;

  lifecycleValid?: boolean | null;

  databaseStatusMatches?: boolean | null;

  derivedStatus?: DocumentStatusValue | null;

  originalFileRequired?: boolean;

  originalFileAvailable?: boolean | null;

  originalFileIntegrityValid?: boolean | null;
}

@Injectable()
export class VerificationPolicyService {
  readonly policyId =
    'vera.public-verification.v2';

  evaluate(
    input: VerificationPolicyInput,
  ): VerificationVerdict {
    /*
     * 1. Identificador Vera.
     */
    if (
      input.method === 'PUBLIC_ID' &&
      input.idChecksumValid !== true
    ) {
      return {
        code: 'INVALID_IDENTIFIER',
        verified: false,
        message:
          'O identificador Vera é inválido.',
      };
    }

    /*
     * 2. Verificação por ficheiro.
     *
     * Se os bytes enviados não correspondem
     * exatamente a uma versão registada,
     * não avançamos.
     */
    if (
      input.method === 'FILE' &&
      input.exactMatch !== true
    ) {
      return {
        code: 'NO_EXACT_MATCH',
        verified: false,
        message:
          'O ficheiro não corresponde exatamente a uma versão registada na Vera.',
      };
    }

    /*
     * 3. O registo precisa existir.
     */
    if (!input.recordFound) {
      return {
        code: 'NOT_FOUND',
        verified: false,
        message:
          'Não foi encontrado um registo Vera correspondente.',
      };
    }

    /*
     * 4. O emissor precisa estar reconhecido
     * pela Vera.
     */
    if (
      input.issuerVerified !== true
    ) {
      return {
        code: 'ISSUER_UNVERIFIED',
        verified: false,
        message:
          'A identidade do emissor não pôde ser confirmada.',
      };
    }

    /*
     * 5. A Attestation precisa ser válida.
     */
    if (
      input.attestationValid !== true
    ) {
      return {
        code: 'TRUST_FAILURE',
        verified: false,
        message:
          'A prova criptográfica do documento não pôde ser validada.',
      };
    }

    /*
     * 6. A cadeia de lifecycle precisa
     * ser válida.
     */
    if (
      input.lifecycleValid !== true
    ) {
      return {
        code: 'LIFECYCLE_FAILURE',
        verified: false,
        message:
          'A cadeia de estado do documento não pôde ser validada.',
      };
    }

    /*
     * 7. Estado derivado das provas assinadas
     * e estado materializado na base precisam
     * concordar.
     */
    if (
      input.databaseStatusMatches !== true
    ) {
      return {
        code: 'INCONSISTENT_RECORD',
        verified: false,
        message:
          'As provas assinadas e o estado atual do registo estão inconsistentes.',
      };
    }

    /*
     * 8. Estado atual.
     *
     * Um documento revogado continua podendo
     * ter provas criptográficas válidas.
     *
     * Mas não é atualmente válido.
     */
    switch (input.derivedStatus) {
      case 'PENDING':
        return {
          code: 'PENDING',
          verified: false,
          message:
            'O documento está pendente de validação.',
        };

      case 'REVOKED':
        return {
          code: 'REVOKED',
          verified: false,
          message:
            'O documento foi revogado.',
        };

      case 'EXPIRED':
        return {
          code: 'EXPIRED',
          verified: false,
          message:
            'O documento expirou.',
        };

      case 'REPLACED':
        return {
          code: 'REPLACED',
          verified: false,
          message:
            'O documento foi substituído por uma versão posterior.',
        };

      case 'VALID':
        break;

      default:
        return {
          code: 'LIFECYCLE_FAILURE',
          verified: false,
          message:
            'Não foi possível determinar o estado atual do documento.',
        };
    }

    /*
     * 9. Integridade do original armazenado.
     *
     * Para PUBLIC_ID e futuramente QR,
     * o original armazenado também faz
     * parte da prova.
     *
     * O nível de acesso PUBLIC/PRIVATE
     * não interfere nesta verificação.
     */
    if (
      input.originalFileRequired === true
    ) {
      if (
        input.originalFileAvailable !== true
      ) {
        return {
          code:
            'ORIGINAL_FILE_UNAVAILABLE',

          verified: false,

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

          verified: false,

          message:
            'A integridade do documento original armazenado não pôde ser confirmada.',
        };
      }
    }

    /*
     * Só chegamos aqui se todas as provas
     * exigidas pela política passaram.
     */
    return {
      code: 'VERIFIED',
      verified: true,
      message:
        'Documento verificado e atualmente válido.',
    };
  }
}