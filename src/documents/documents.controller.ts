import {
  Controller,
  Get,
  Param,
  StreamableFile,
} from '@nestjs/common';

import {
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

        version:
          1,

        schema:
          'vera.qr.v2',

        algorithm:
          'Ed25519',

        keyId:
          'vera-dev-2026-02',

        proof:
          'vqr2.eyJ0eXAiOiJWUVI...',

        verificationUrl:
          'http://localhost:3000/verify?proof=vqr2...',
      },
    },
  })
  @ApiNotFoundResponse({
    description:
      'Documento ou QR Proof não encontrado.',
  })
  async getQrProof(
    @Param(
      'publicId',
    )
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
    @Param(
      'publicId',
    )
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
    @Param(
      'publicId',
    )
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
    @Param(
      'publicId',
    )
    publicId:
      string,
  ) {
    return this.documentsService
      .findByPublicId(
        publicId,
      );
  }
}