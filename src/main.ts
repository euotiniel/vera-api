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

function parseBooleanEnvironmentVariable(
  name:
    string,

  fallback:
    boolean,
): boolean {
  const rawValue =
    process.env[name]
      ?.trim()
      .toLowerCase();

  if (!rawValue) {
    return fallback;
  }

  if (
    rawValue === 'true' ||
    rawValue === '1'
  ) {
    return true;
  }

  if (
    rawValue === 'false' ||
    rawValue === '0'
  ) {
    return false;
  }

  throw new Error(
    `${name} must be true, false, 1 or 0`,
  );
}

async function bootstrap() {
  const app =
    await NestFactory.create(
      AppModule,
    );

  /*
   * ============================================================
   * ENVIRONMENT
   * ============================================================
   */

  const nodeEnvironment =
    process.env.NODE_ENV
      ?.trim()
      .toLowerCase() ??
    'development';

  const isProduction =
    nodeEnvironment ===
    'production';

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
   * Desenvolvimento:
   *
   * CORS_ORIGINS=http://localhost:3000
   *
   * Produção:
   *
   * CORS_ORIGINS=https://vera.ao
   *
   * Múltiplas origens podem ser separadas
   * por vírgula.
   *
   * Em produção não fazemos fallback para
   * localhost. Uma configuração CORS ausente
   * é erro de configuração e deve impedir o
   * arranque.
   */

  const configuredCorsOrigins =
    process.env.CORS_ORIGINS
      ?.trim();

  if (
    isProduction &&
    !configuredCorsOrigins
  ) {
    throw new Error(
      'CORS_ORIGINS must be defined in production',
    );
  }

  const corsOrigins =
    (
      configuredCorsOrigins ??
      'http://localhost:3000'
    )
      .split(',')
      .map(
        (
          origin,
        ) =>
          origin.trim(),
      )
      .filter(
        Boolean,
      );

  if (
    corsOrigins.length ===
    0
  ) {
    throw new Error(
      'CORS_ORIGINS must contain at least one valid origin',
    );
  }

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
   *
   * Desenvolvimento:
   * ativo por padrão.
   *
   * Produção:
   * desligado por padrão.
   *
   * Pode ser explicitamente controlado por:
   *
   * SWAGGER_ENABLED=true
   * SWAGGER_ENABLED=false
   */

  const swaggerEnabled =
    parseBooleanEnvironmentVariable(
      'SWAGGER_ENABLED',
      !isProduction,
    );

  if (swaggerEnabled) {
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
  }

  /*
   * ============================================================
   * SERVER
   * ============================================================
   */

  const port =
    Number(
      process.env.PORT ??
      4000,
    );

  if (
    !Number.isInteger(
      port,
    ) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      'PORT must be a valid TCP port',
    );
  }

  await app.listen(
    port,
    '0.0.0.0',
  );

  console.log(
    `Vera API running on port ${port}`,
  );

  if (swaggerEnabled) {
    console.log(
      'Vera API docs available at /api/docs',
    );

    console.log(
      'Vera OpenAPI JSON available at /api/docs-json',
    );
  }
}

bootstrap();