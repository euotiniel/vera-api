import {
  Controller,
  Get,
} from '@nestjs/common';

import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  PrismaService,
} from './prisma/prisma.service.js';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Verificar estado da API',

    description:
      'Confirma que a Vera API está operacional e consegue comunicar com a base de dados.',
  })
  @ApiOkResponse({
    description:
      'API operacional.',

    schema: {
      example: {
        status:
          'ok',

        database:
          'connected',

        organizations:
          1,
      },
    },
  })
  async health() {
    const organizations =
      await this.prisma
        .organization
        .count();

    return {
      status:
        'ok',

      database:
        'connected',

      organizations,
    };
  }
}