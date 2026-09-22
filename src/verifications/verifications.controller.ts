import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import { VerificationsService } from './verifications.service.js';

@Controller('verifications')
export class VerificationsController {
  constructor(
    private readonly verificationsService:
      VerificationsService,
  ) {}

  @Get('id/:publicId')
  async verifyByPublicId(
    @Param('publicId')
    publicId: string,
  ) {
    return this.verificationsService
      .verifyByPublicId(
        publicId,
      );
  }

  @Post('file')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor(
      'file',
      {
        limits: {
          fileSize:
            10 * 1024 * 1024,
        },
      },
    ),
  )
  async verifyFile(
    @UploadedFile()
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'O ficheiro é obrigatório.',
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

    return this.verificationsService
      .verifyFile(file);
  }
}