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

import { FileInterceptor } from '@nestjs/platform-express';

import { DocumentsService } from './documents.service.js';

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService:
      DocumentsService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize:
          10 * 1024 * 1024,
      },
    }),
  )
  async create(
    @UploadedFile()
    file: Express.Multer.File,

    @Body('organizationSlug')
    organizationSlug: string,

    @Body('title')
    title: string,

    @Body('type')
    type?: string,

    @Body('reference')
    reference?: string,
  ) {
    if (!file) {
      throw new BadRequestException(
        'O ficheiro PDF é obrigatório.',
      );
    }

    if (
      file.mimetype !==
      'application/pdf'
    ) {
      throw new BadRequestException(
        'Apenas ficheiros PDF são aceites.',
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

    return this.documentsService.create({
      file,
      organizationSlug,
      title,
      type,
      reference,
    });
  }

  @Get(':publicId/file')
  async getOriginalFile(
    @Param('publicId')
    publicId: string,
  ) {
    const file =
      await this.documentsService
        .getOriginalFile(publicId);

    /*
     * StreamableFile faz o Nest enviar
     * bytes reais em vez de JSON.
     *
     * Usamos inline porque queremos poder
     * mostrar o PDF dentro da UI da Vera.
     */
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

  @Get(':publicId')
  async findByPublicId(
    @Param('publicId')
    publicId: string,
  ) {
    return this.documentsService
      .findByPublicId(publicId);
  }
}