import {
  Controller,
  Get,
  Header,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  AccessTokenGuard,
} from '../auth/access-token.guard.js';

import {
  SystemRoleGuard,
} from '../auth/system-role.guard.js';

import {
  SystemRoles,
} from '../auth/system-roles.decorator.js';

import {
  AdminVerificationAuditService,
} from './admin-verification-audit.service.js';

@ApiTags('Admin')
@ApiBearerAuth(
  'access-token',
)
@Controller(
  'admin/verifications',
)
@UseGuards(
  AccessTokenGuard,
  SystemRoleGuard,
)
@SystemRoles(
  'PLATFORM_ADMIN',
)
export class AdminVerificationAuditController {
  constructor(
    private readonly adminVerificationAuditService:
      AdminVerificationAuditService,
  ) {}

  @Get(
    'audit.csv',
  )
  @ApiOperation({
    summary:
      'Exportar auditoria de verificações em CSV',

    description:
      'Exporta os eventos de auditoria das verificações públicas da Vera. Apenas PLATFORM_ADMIN pode aceder a este endpoint.',
  })
  @ApiProduces(
    'text/csv',
  )
  @ApiOkResponse({
    description:
      'Ficheiro CSV com o histórico de verificações públicas.',

    content: {
      'text/csv': {
        schema: {
          type:
            'string',

          example:
            '"id","createdAt","method","policy","verdictCode","verified","publicId","documentId","hash","matched"',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description:
      'Autenticação necessária.',
  })
  @ApiForbiddenResponse({
    description:
      'Apenas PLATFORM_ADMIN pode exportar a auditoria.',
  })
  @Header(
    'Content-Type',
    'text/csv; charset=utf-8',
  )
  @Header(
    'Content-Disposition',
    'attachment; filename="vera-verification-audit.csv"',
  )
  @Header(
    'Cache-Control',
    'no-store',
  )
  async exportAuditCsv() {
    const exportResult =
      await this
        .adminVerificationAuditService
        .exportCsv();

    return exportResult.body;
  }
}