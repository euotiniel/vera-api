import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import {
  Injectable,
  OnModuleInit,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

interface PutFileInput {
  key:
    string;

  body:
    Buffer;

  contentType:
    string;
}

@Injectable()
export class StorageService
  implements OnModuleInit
{
  private readonly client:
    S3Client;

  private readonly bucket:
    string;

  private readonly createBucketIfMissing:
    boolean;

  constructor(
    private readonly configService:
      ConfigService,
  ) {
    const endpoint =
      this.configService
        .get<string>(
          'S3_ENDPOINT',
        )
        ?.trim();

    const region =
      this.configService
        .get<string>(
          'S3_REGION',
        )
        ?.trim();

    const accessKey =
      this.configService
        .get<string>(
          'S3_ACCESS_KEY',
        )
        ?.trim();

    const secretKey =
      this.configService
        .get<string>(
          'S3_SECRET_KEY',
        )
        ?.trim();

    const bucket =
      this.configService
        .get<string>(
          'S3_BUCKET',
        )
        ?.trim();

    if (!endpoint) {
      throw new Error(
        'S3_ENDPOINT is not defined',
      );
    }

    if (!region) {
      throw new Error(
        'S3_REGION is not defined',
      );
    }

    if (!accessKey) {
      throw new Error(
        'S3_ACCESS_KEY is not defined',
      );
    }

    if (!secretKey) {
      throw new Error(
        'S3_SECRET_KEY is not defined',
      );
    }

    if (!bucket) {
      throw new Error(
        'S3_BUCKET is not defined',
      );
    }

    const forcePathStyle =
      this.parseBoolean(
        'S3_FORCE_PATH_STYLE',
        this.configService
          .get<string>(
            'S3_FORCE_PATH_STYLE',
          ),
        true,
      );

    const isProduction =
      (
        process.env.NODE_ENV ??
        ''
      )
        .trim()
        .toLowerCase() ===
      'production';

    this.createBucketIfMissing =
      this.parseBoolean(
        'S3_CREATE_BUCKET_IF_MISSING',
        this.configService
          .get<string>(
            'S3_CREATE_BUCKET_IF_MISSING',
          ),
        !isProduction,
      );

    this.bucket =
      bucket;

    this.client =
      new S3Client({
        endpoint,

        region,

        credentials: {
          accessKeyId:
            accessKey,

          secretAccessKey:
            secretKey,
        },

        forcePathStyle,
      });
  }

  async onModuleInit() {
    await this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket:
            this.bucket,
        }),
      );

      return;
    } catch {
      if (
        !this.createBucketIfMissing
      ) {
        throw new Error(
          `S3 bucket "${this.bucket}" does not exist or is not accessible`,
        );
      }
    }

    await this.client.send(
      new CreateBucketCommand({
        Bucket:
          this.bucket,
      }),
    );
  }

  async putFile(
    input:
      PutFileInput,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket:
          this.bucket,

        Key:
          input.key,

        Body:
          input.body,

        ContentType:
          input.contentType,
      }),
    );
  }

  async getFile(
    key:
      string,
  ) {
    const result =
      await this.client.send(
        new GetObjectCommand({
          Bucket:
            this.bucket,

          Key:
            key,
        }),
      );

    if (!result.Body) {
      throw new Error(
        'Stored file has no body',
      );
    }

    const bytes =
      await result.Body
        .transformToByteArray();

    return {
      body:
        Buffer.from(
          bytes,
        ),

      contentType:
        result.ContentType ??
        'application/octet-stream',

      contentLength:
        result.ContentLength,
    };
  }

  async deleteFile(
    key:
      string,
  ): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket:
          this.bucket,

        Key:
          key,
      }),
    );
  }

  /**
   * Caminho histórico utilizado pela
   * emissão inicial.
   *
   * Mantemos este método para não alterar
   * o namespace dos documentos existentes.
   */
  buildDocumentKey(
    publicId:
      string,

    version:
      number,
  ): string {
    return [
      'documents',
      publicId,
      'versions',
      String(
        version,
      ),
      'original.pdf',
    ].join('/');
  }

  /**
   * Novas versões usam um objectId único.
   *
   * Duas tentativas concorrentes de emitir
   * a mesma próxima versão nunca escrevem
   * sobre o mesmo objecto S3.
   *
   * A unicidade lógica da versão continua
   * a ser garantida pelo PostgreSQL através
   * de (documentId, version).
   */
  buildDocumentVersionKey(
    publicId:
      string,

    version:
      number,

    objectId:
      string,
  ): string {
    return [
      'documents',
      publicId,
      'versions',
      String(
        version,
      ),
      objectId,
      'original.pdf',
    ].join('/');
  }

  private parseBoolean(
    name:
      string,

    value:
      string | undefined,

    fallback:
      boolean,
  ): boolean {
    const normalized =
      value
        ?.trim()
        .toLowerCase();

    if (!normalized) {
      return fallback;
    }

    if (
      normalized === 'true' ||
      normalized === '1'
    ) {
      return true;
    }

    if (
      normalized === 'false' ||
      normalized === '0'
    ) {
      return false;
    }

    throw new Error(
      `${name} must be true, false, 1 or 0`,
    );
  }
}