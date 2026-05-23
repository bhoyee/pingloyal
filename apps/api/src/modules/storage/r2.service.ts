import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

export interface UploadFileParams {
  key: string;
  buffer: Buffer;
  contentType: string;
  cacheControl?: string;
}

@Injectable()
export class R2Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly accountId: string;

  constructor(private readonly config: ConfigService) {
    this.accountId = this.config.getOrThrow<string>('R2_ACCOUNT_ID');
    this.bucket = this.config.getOrThrow<string>('R2_BUCKET');

    this.client = new S3Client({
      endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('R2_ACCESS_KEY'),
        secretAccessKey: this.config.getOrThrow<string>('R2_SECRET_KEY'),
      },
    });
  }

  async uploadFile(params: UploadFileParams): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.buffer,
        ContentType: params.contentType,
        CacheControl: params.cacheControl,
      }),
    );

    return `https://${this.bucket}.${this.accountId}.r2.cloudflarestorage.com/${params.key}`;
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
