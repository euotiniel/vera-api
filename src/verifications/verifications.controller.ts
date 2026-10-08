import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';

import {
  FileInterceptor,
} from '@nestjs/platform-express';

import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import {
  PrismaService,
} from '../prisma/prisma.service.js';

import {
  VerificationsService,
} from './verifications.service.js';

import {
  QrVerificationService,
} from './qr-verification.service.js';

@ApiTags('Verifications')
@Controller('verifications')
export class VerificationsController {
  constructor(
    private readonly verificationsService:
      VerificationsService,

    private readonly qrVerificationService:
      QrVerificationService,

    private readonly prisma:
      PrismaService,
  ) {}

  /*
   * ============================================================
   * VERIFY BY PUBLIC ID
   * ============================================================
   */

  @Get(
    'id/:publicId',
  )
  @ApiOperation({
    summary:
      'Verificar por Public ID',

    description:
      `
Verifica o documento utilizando o seu identificador público Vera.

A operação verifica:

- checksum do Public ID;
- existência do registo;
- estado do emissor;
- Attestation;
- cadeia Lifecycle;
- correspondência entre estado derivado e estado materializado;
- existência e integridade do original armazenado.

O resultado é expresso através da Verification Policy da Vera.
      `,
  })
  @ApiParam({
    name:
      'publicId',

    example:
      'VRA-M4WN-YTA4-T2YK-JT0V-RH',

    description:
      'Public ID Vera.',
  })
  @ApiOkResponse({
    description:
      'Resultado da verificação.',

    schema: {
      example: {
        method:
          'PUBLIC_ID',

        policy:
          'vera.public-verification.v4',

        verdict: {
          code:
            'VERIFIED',

          verified:
            true,

          message:
            'Documento verificado e atualmente válido.',
        },

        publicId:
          'VRA-M4WN-YTA4-T2YK-JT0V-RH',

        checks: {
          idChecksumValid:
            true,

          recordFound:
            true,

          issuerVerified:
            true,

          attestationValid:
            true,

          lifecycleValid:
            true,

          databaseStatusMatches:
            true,

          originalFileAvailable:
            true,

          originalFileIntegrityValid:
            true,
        },

        status: {
          derived:
            'VALID',

          database:
            'VALID',
        },
      },
    },
  })
  async verifyByPublicId(
    @Param('publicId')
    publicId:
      string,
  ) {
    const result =
      await this.verificationsService
        .verifyByPublicId(
          publicId,
        );

    await this.recordAudit(
      result,
    );

    return result;
  }

  /*
   * ============================================================
   * VERIFY BY FILE
   * ============================================================
   */

  @Post(
    'file',
  )
  @HttpCode(
    HttpStatus.OK,
  )
  @ApiOperation({
    summary:
      'Verificar Exact Match por ficheiro',

    description:
      `
Calcula o SHA-256 dos bytes enviados e procura uma versão documental
registada com exatamente o mesmo hash.

\`exactMatch: true\` significa correspondência byte-for-byte.

O MIME fornecido pelo cliente não é considerado fonte de confiança.
O ficheiro não é normalizado ou regravado antes do hash.
      `,
  })
  @ApiConsumes(
    'multipart/form-data',
  )
  @ApiBody({
    schema: {
      type:
        'object',

      required: [
        'file',
      ],

      properties: {
        file: {
          type:
            'string',

          format:
            'binary',

          description:
            'PDF a verificar. Máximo: 10 MB.',
        },
      },
    },
  })
  @ApiOkResponse({
    description:
      'Resultado Exact Match.',

    schema: {
      example: {
        method:
          'FILE',

        policy:
          'vera.public-verification.v4',

        verdict: {
          code:
            'VERIFIED',

          verified:
            true,

          message:
            'Documento verificado e atualmente válido.',
        },

        hash:
          '93d24c82578fc7c525b00ad5c32eb4d8ccc3517f1ce13ee794d031a5357c03d5',

        exactMatch:
          true,

        checks: {
          exactMatch:
            true,

          recordFound:
            true,

          issuerVerified:
            true,

          attestationValid:
            true,

          lifecycleValid:
            true,

          databaseStatusMatches:
            true,
        },

        status: {
          derived:
            'VALID',

          database:
            'VALID',
        },

        document: {
          publicId:
            'VRA-M4WN-YTA4-T2YK-JT0V-RH',

          title:
            'Pedido de parceria',

          type:
            'Ofício',

          reference:
            '0054/2026',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Ficheiro ausente ou os bytes não possuem assinatura básica de PDF.',
  })
  @UseInterceptors(
    FileInterceptor(
      'file',
      {
        limits: {
          fileSize:
            10 *
            1024 *
            1024,
        },
      },
    ),
  )
  async verifyFile(
    @UploadedFile()
    file:
      Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'O ficheiro é obrigatório.',
      );
    }

    const result =
      await this.verificationsService
        .verifyFile(
          file,
        );

    await this.recordAudit(
      result,
    );

    return result;
  }

  /*
   * ============================================================
   * VERIFY QR PROOF
   * ============================================================
   */

  @Post(
    'qr',
  )
  @HttpCode(
    HttpStatus.OK,
  )
  @ApiOperation({
    summary:
      'Verificar QR Proof',

    description:
      `
Valida uma prova QR v2 emitida pela Vera.

A verificação inclui a assinatura Ed25519 do QR, os claims da prova,
a ligação à Attestation e o estado atual do documento.

Uma prova QR pode continuar criptograficamente autêntica mesmo depois
de o documento ter sido revogado. Nesse caso o verdict será REVOKED.
      `,
  })
  @ApiBody({
    schema: {
      type:
        'object',

      required: [
        'proof',
      ],

      properties: {
        proof: {
          type:
            'string',

          example:
            'vqr2.eyJ0eXAiOiJWVVIiLCJhbGciOiJFZDI1NTE5Iiwi...',

          description:
            'QR Proof v2 completo.',
        },
      },
    },
  })
  @ApiOkResponse({
    description:
      'Resultado da verificação da prova QR.',

    schema: {
      example: {
        method:
          'QR',

        policy:
          'vera.public-verification.v4',

        verdict: {
          code:
            'VERIFIED',

          verified:
            true,

          message:
            'Documento verificado e atualmente válido.',
        },

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

          issuerVerified:
            true,

          attestationValid:
            true,

          lifecycleValid:
            true,

          databaseStatusMatches:
            true,

          originalFileAvailable:
            true,

          originalFileIntegrityValid:
            true,
        },

        qr: {
          valid:
            true,

          structureValid:
            true,

          signatureValid:
            true,

          keyId:
            'vera-dev-2026-02',
        },

        status: {
          derived:
            'VALID',

          database:
            'VALID',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Campo proof ausente ou inválido.',
  })
  async verifyQr(
    @Body('proof')
    proof:
      string,
  ) {
    if (
      !proof ||
      typeof proof !==
        'string'
    ) {
      throw new BadRequestException(
        'A prova QR é obrigatória.',
      );
    }

    const result =
      await this.qrVerificationService
        .verify(
          proof,
        );

    await this.recordAudit(
      result,
    );

    return result;
  }

  /*
   * ============================================================
   * VERIFICATION AUDIT
   * ============================================================
   */

  private async recordAudit(
    result:
      unknown,
  ): Promise<void> {
    if (
      !this.isRecord(
        result,
      )
    ) {
      throw new Error(
        'Resultado de verificação inválido para auditoria.',
      );
    }

    const method =
      result.method;

    const policy =
      result.policy;

    const verdict =
      result.verdict;

    if (
      (
        method !==
          'PUBLIC_ID' &&
        method !==
          'FILE' &&
        method !==
          'QR'
      ) ||
      typeof policy !==
        'string' ||
      !this.isRecord(
        verdict,
      ) ||
      typeof verdict.code !==
        'string' ||
      typeof verdict.verified !==
        'boolean'
    ) {
      throw new Error(
        'Resultado de verificação incompleto para auditoria.',
      );
    }

    let publicId:
      string |
      null =
        typeof result.publicId ===
        'string'
          ? result.publicId
          : null;

    if (
      !publicId &&
      this.isRecord(
        result.document,
      ) &&
      typeof result.document
        .publicId ===
        'string'
    ) {
      publicId =
        result.document.publicId;
    }

    let documentId:
      string |
      null =
        null;

    if (publicId) {
      const document =
        await this.prisma
          .document
          .findUnique({
            where: {
              publicId,
            },

            select: {
              id:
                true,
            },
          });

      documentId =
        document?.id ??
        null;
    }

    const hash =
      method ===
        'FILE' &&
      typeof result.hash ===
        'string'
        ? result.hash
        : null;

    const matched =
      method ===
        'FILE' &&
      typeof result.exactMatch ===
        'boolean'
        ? result.exactMatch
        : null;

    await this.prisma
      .verificationAuditEvent
      .create({
        data: {
          method,

          policy,

          verdictCode:
            verdict.code,

          verified:
            verdict.verified,

          publicId,

          documentId,

          hash,

          matched,
        },
      });
  }

  private isRecord(
    value:
      unknown,
  ): value is
    Record<
      string,
      unknown
    > {
    return (
      typeof value ===
        'object' &&
      value !==
        null
    );
  }
}