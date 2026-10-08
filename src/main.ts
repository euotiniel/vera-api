import {
  NestFactory,
} from '@nestjs/core';

import {
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';

import {
  AppModule,
} from './app.module.js';

async function bootstrap() {
  const app =
    await NestFactory.create(
      AppModule,
    );

  /*
   * ============================================================
   * GLOBAL API PREFIX
   * ============================================================
   */

  app.setGlobalPrefix(
    'api',
  );

  /*
   * ============================================================
   * CORS
   * ============================================================
   *
   * Em desenvolvimento:
   *
   * CORS_ORIGINS=http://localhost:3000
   *
   * Em produção:
   *
   * CORS_ORIGINS=https://vera.ao
   *
   * Também suporta múltiplas origens
   * separadas por vírgula.
   */

  const corsOrigins =
    (
      process.env
        .CORS_ORIGINS ??
      'http://localhost:3000'
    )
      .split(',')
      .map(
        (origin) =>
          origin.trim(),
      )
      .filter(
        Boolean,
      );

  app.enableCors({
    origin:
      corsOrigins,

    credentials:
      true,
  });

  /*
   * ============================================================
   * OPENAPI / SWAGGER
   * ============================================================
   */

  const swaggerConfig =
    new DocumentBuilder()
      .setTitle(
        'Vera API',
      )

      .setVersion(
        '0.1.0',
      )

      .addTag(
        'System',
        'Estado e informações básicas da API.',
      )

      .addTag(
        'Documents',
        'Registo, consulta e obtenção de provas de documentos.',
      )

      .addTag(
        'Verifications',
        'Verificação pública por ID, ficheiro ou QR Proof.',
      )

      .build();

  const swaggerDocument =
    SwaggerModule.createDocument(
      app,
      swaggerConfig,
    );

  SwaggerModule.setup(
    'api/docs',
    app,
    swaggerDocument,
    {
      customSiteTitle:
        'Vera API — Documentation',

      swaggerOptions: {
        persistAuthorization:
          true,

        displayRequestDuration:
          true,

        filter:
          true,

        operationsSorter:
          'alpha',

        docExpansion:
          'list',
      },
    },
  );

  /*
   * ============================================================
   * SERVER
   * ============================================================
   */

  const port =
    process.env.PORT ??
    4000;

  await app.listen(
    port,
  );

  console.log(
    `Vera API running on port ${port}`,
  );

  console.log(
    `Vera API docs available at /api/docs`,
  );

  console.log(
    `Vera OpenAPI JSON available at /api/docs-json`,
  );
}

bootstrap();