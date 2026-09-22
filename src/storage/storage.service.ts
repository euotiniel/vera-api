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
import { ConfigService } from '@nestjs/config';

interface PutFileInput {
  key: string;
  body: Buffer;
  contentType: string;
}

@Injectable()
export class StorageService
  implements OnModuleInit
{
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly configService: ConfigService,
  ) {
    const endpoint =
      this.configService.get<string>(
        'S3_ENDPOINT',
      );

    const region =
      this.configService.get<string>(
        'S3_REGION',
      );

    const accessKey =
      this.configService.get<string>(
        'S3_ACCESS_KEY',
      );

    const secretKey =
      this.configService.get<string>(
        'S3_SECRET_KEY',
      );

    const bucket =
      this.configService.get<string>(
        'S3_BUCKET',
      );

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

    this.bucket = bucket;

    this.client = new S3Client({
      endpoint,
      region,

      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },

      forcePathStyle: true,
    });
  }

  async onModuleInit() {
    await this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.bucket,
        }),
      );
    } catch {
      await this.client.send(
        new CreateBucketCommand({
          Bucket: this.bucket,
        }),
      );
    }
  }

  async putFile(
    input: PutFileInput,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,

        Key: input.key,

        Body: input.body,

        ContentType:
          input.contentType,
      }),
    );
  }

  async getFile(key: string) {
    const result =
      await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
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
      body: Buffer.from(bytes),

      contentType:
        result.ContentType ??
        'application/octet-stream',

      contentLength:
        result.ContentLength,
    };
  }

  async deleteFile(
    key: string,
  ): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  buildDocumentKey(
    publicId: string,
    version: number,
  ): string {
    return [
      'documents',
      publicId,
      'versions',
      String(version),
      'original.pdf',
    ].join('/');
  }
}