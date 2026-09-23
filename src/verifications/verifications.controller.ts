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

import { FileInterceptor } from '@nestjs/platform-express';

import { VerificationsService } from './verifications.service.js';

import { QrVerificationService } from './qr-verification.service.js';

@Controller('verifications')
export class VerificationsController {
  constructor(
    private readonly verificationsService:
      VerificationsService,

    private readonly qrVerificationService:
      QrVerificationService,
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
  @HttpCode(
    HttpStatus.OK,
  )
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
    file:
      Express.Multer.File,
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
      .verifyFile(
        file,
      );
  }

  @Post('qr')
  @HttpCode(
    HttpStatus.OK,
  )
  async verifyQr(
    @Body('proof')
    proof: string,
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

    return this.qrVerificationService
      .verify(
        proof,
      );
  }
}