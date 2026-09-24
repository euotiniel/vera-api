import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';

import {
  FileInterceptor,
} from '@nestjs/platform-express';

import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';

import {
  DocumentsService,
} from './documents.service.js';

import {
  DocumentQrService,
} from './document-qr.service.js';

@ApiTags('Documents')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService:
      DocumentsService,

    private readonly documentQrService:
      DocumentQrService,
  ) {}

  /*
   * ============================================================
   * REGISTER DOCUMENT
   * ============================================================
   */

  @Post()
  @ApiOperation({
    summary:
      'Registar documento',

    description:
      `
Regista uma nova versão documental na Vera.

O ficheiro é validado pelos seus próprios bytes. O MIME enviado pelo
cliente não é utilizado como fonte de confiança.

Durante o registo a Vera executa, entre outras verificações:

- validação estrutural do PDF;
- validação de conteúdo ativo;
- SHA-256 dos bytes originais;
- armazenamento do original;
- verificação read-after-write;
- criação da Attestation;
- criação do QR Proof;
- criação do primeiro evento Lifecycle.

O ficheiro original não é regravado nem normalizado antes do hash.
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
        'organizationSlug',
        'title',
      ],

      properties: {
        file: {
          type:
            'string',

          format:
            'binary',

          description:
            'Documento PDF original. Máximo: 10 MB.',
        },

        organizationSlug: {
          type:
            'string',

          example:
            'aeucan',

          description:
            'Slug da organização emissora.',
        },

        title: {
          type:
            'string',

          example:
            'Pedido de parceria',

          description:
            'Título público do documento.',
        },

        type: {
          type:
            'string',

          example:
            'Ofício',

          nullable:
            true,
        },

        reference: {
          type:
            'string',

          example:
            '0054/2026',

          nullable:
            true,
        },
      },
    },
  })
  @ApiCreatedResponse({
    description:
      'Documento registado com sucesso.',

    schema: {
      example: {
        id:
          'cmu_example',

        publicId:
          'VRA-M4WN-YTA4-T2YK-JT0V-RH',

        title:
          'Pedido de parceria',

        type:
          'Ofício',

        reference:
          '0054/2026',

        status:
          'VALID',

        issuedAt:
          '2026-09-24T09:09:07.428Z',

        organization: {
          name:
            'Associação dos Estudantes da Universidade Católica de Angola',

          slug:
            'aeucan',

          verified:
            true,
        },

        originalFile: {
          available:
            true,

          access:
            'PUBLIC',
        },

        version: {
          version:
            1,

          filename:
            'pedido-parceria.pdf',

          mimeType:
            'application/pdf',

          size:
            921,

          sha256:
            '93d24c82578fc7c525b00ad5c32eb4d8ccc3517f1ce13ee794d031a5357c03d5',

          registeredAt:
            '2026-09-24T09:09:07.428Z',
        },

        qr: {
          available:
            true,

          schema:
            'vera.qr.v2',

          algorithm:
            'Ed25519',

          keyId:
            'vera-dev-2026-02',
        },

        attestation: {
          schema:
            'vera.attestation.v2',

          algorithm:
            'Ed25519',

          keyId:
            'vera-dev-2026-02',

          signature:
            'Base64URLSignature...',

          createdAt:
            '2026-09-24T09:09:07.428Z',
        },

        lifecycle: {
          sequence:
            1,

          type:
            'REGISTERED',

          fromStatus:
            null,

          toStatus:
            'VALID',

          previousEventHash:
            null,

          eventHash:
            '3bbb003883cd...',

          algorithm:
            'Ed25519',

          keyId:
            'vera-dev-2026-02',

          createdAt:
            '2026-09-24T09:09:07.428Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'PDF inválido, campos obrigatórios ausentes ou documento não permitido pela política PDF.',
  })
  @ApiConflictResponse({
    description:
      'Os mesmos bytes já estão registados na Vera.',
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
  async create(
    @UploadedFile()
    file:
      Express.Multer.File,

    @Body('organizationSlug')
    organizationSlug:
      string,

    @Body('title')
    title:
      string,

    @Body('type')
    type?:
      string,

    @Body('reference')
    reference?:
      string,
  ) {
    if (!file) {
      throw new BadRequestException(
        'O ficheiro PDF é obrigatório.',
      );
    }

    if (!organizationSlug) {
      throw new BadRequestException(
        'A organização é obrigatória.',
      );
    }

    if (!title) {
      throw new BadRequestException(
        'O título do documento é obrigatório.',
      );
    }

    return this.documentsService
      .create({
        file,
        organizationSlug,
        title,
        type,
        reference,
      });
  }

  /*
   * ============================================================
   * QR PROOF
   * ============================================================
   */

  @Get(
    ':publicId/qr-proof',
  )
  @ApiOperation({
    summary:
      'Obter QR Proof',

    description:
      'Obtém a prova QR persistida da versão atual do documento. Este endpoint não cria uma nova assinatura.',
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
      'QR Proof persistido.',

    schema: {
      example: {
        publicId:
          'VRA-M4WN-YTA4-T2YK-JT0V-RH',

        schema:
          'vera.qr.v2',

        algorithm:
          'Ed25519',

        keyId:
          'vera-dev-2026-02',

        proof:
          'vqr2.eyJ0eXAiOiJWUVI...',
      },
    },
  })
  @ApiNotFoundResponse({
    description:
      'Documento ou QR Proof não encontrado.',
  })
  async getQrProof(
    @Param('publicId')
    publicId:
      string,
  ) {
    return this.documentQrService
      .getProof(
        publicId,
      );
  }

  /*
   * ============================================================
   * QR IMAGE
   * ============================================================
   */

  @Get(
    ':publicId/qr',
  )
  @ApiOperation({
    summary:
      'Obter QR Code',

    description:
      'Gera a representação PNG do QR associado à prova criptográfica persistida do documento.',
  })
  @ApiParam({
    name:
      'publicId',

    example:
      'VRA-M4WN-YTA4-T2YK-JT0V-RH',
  })
  @ApiProduces(
    'image/png',
  )
  @ApiOkResponse({
    description:
      'Imagem PNG do QR Code.',

    schema: {
      type:
        'string',

      format:
        'binary',
    },
  })
  @ApiNotFoundResponse({
    description:
      'Documento ou QR Proof não encontrado.',
  })
  async getQrImage(
    @Param('publicId')
    publicId:
      string,
  ) {
    const qr =
      await this.documentQrService
        .getQrImage(
          publicId,
        );

    return new StreamableFile(
      qr.body,
      {
        type:
          'image/png',

        disposition:
          `inline; filename="vera-${qr.publicId}.png"`,

        length:
          qr.body.length,
      },
    );
  }

  /*
   * ============================================================
   * ORIGINAL FILE
   * ============================================================
   */

  @Get(
    ':publicId/file',
  )
  @ApiOperation({
    summary:
      'Obter documento original',

    description:
      `
Obtém os bytes originais armazenados pela Vera quando a política de acesso
do documento permite visualização pública.

Antes de servir o ficheiro, a Vera verifica a integridade dos bytes armazenados.
      `,
  })
  @ApiParam({
    name:
      'publicId',

    example:
      'VRA-M4WN-YTA4-T2YK-JT0V-RH',
  })
  @ApiProduces(
    'application/pdf',
  )
  @ApiOkResponse({
    description:
      'PDF original registado.',

    schema: {
      type:
        'string',

      format:
        'binary',
    },
  })
  @ApiNotFoundResponse({
    description:
      'Documento ou ficheiro original não encontrado.',
  })
  async getOriginalFile(
    @Param('publicId')
    publicId:
      string,
  ) {
    const file =
      await this.documentsService
        .getOriginalFile(
          publicId,
        );

    return new StreamableFile(
      file.body,
      {
        type:
          file.contentType,

        disposition:
          'inline; filename="documento-original.pdf"',

        length:
          file.body.length,
      },
    );
  }

  /*
   * ============================================================
   * DOCUMENT INFORMATION
   * ============================================================
   */

  @Get(
    ':publicId',
  )
  @ApiOperation({
    summary:
      'Consultar documento',

    description:
      'Obtém os dados públicos atuais de um documento registado na Vera.',
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
      'Documento encontrado.',

    schema: {
      example: {
        publicId:
          'VRA-M4WN-YTA4-T2YK-JT0V-RH',

        title:
          'Pedido de parceria',

        type:
          'Ofício',

        reference:
          '0054/2026',

        status:
          'VALID',

        issuedAt:
          '2026-09-24T09:09:07.428Z',

        organization: {
          name:
            'Associação dos Estudantes da Universidade Católica de Angola',

          slug:
            'aeucan',

          verified:
            true,
        },

        version: {
          version:
            1,

          filename:
            'pedido-parceria.pdf',

          mimeType:
            'application/pdf',

          size:
            921,
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description:
      'Documento não encontrado.',
  })
  async findByPublicId(
    @Param('publicId')
    publicId:
      string,
  ) {
    return this.documentsService
      .findByPublicId(
        publicId,
      );
  }
}