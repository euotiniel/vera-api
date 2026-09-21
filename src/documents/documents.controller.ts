import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service.js';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body('organizationSlug') organizationSlug: string,
    @Body('title') title: string,
    @Body('type') type?: string,
    @Body('reference') reference?: string,
  ) {
    if (!file) {
      throw new BadRequestException('O ficheiro PDF é obrigatório.');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Apenas ficheiros PDF são aceites.');
    }

    if (!organizationSlug) {
      throw new BadRequestException('A organização é obrigatória.');
    }

    if (!title) {
      throw new BadRequestException('O título do documento é obrigatório.');
    }

    return this.documentsService.create({
      file,
      organizationSlug,
      title,
      type,
      reference,
    });
  }

  @Get(':publicId')
async findByPublicId(
  @Param('publicId') publicId: string,
) {
  return this.documentsService.findByPublicId(publicId);
}
}