import { Readable } from "stream";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import type { StorageAdapter } from "./types.js";

export class S3StorageAdapter implements StorageAdapter {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.AWS_REGION;
    if (!bucket) throw new Error("Missing required environment variable S3_BUCKET");
    if (!region) throw new Error("Missing required environment variable AWS_REGION");
    this.bucket = bucket;
    this.client = new S3Client({ region });
  }

  async getUploadTarget(key: string, contentType: string, maxBytes: number) {
    const target = await createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [
        ["content-length-range", 1, maxBytes],
        ["eq", "$Content-Type", contentType],
      ],
      Fields: {
        "Content-Type": contentType,
      },
      Expires: 300,
    });
    return { method: "POST" as const, url: target.url, fields: target.fields };
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    if (!result.Body) return Buffer.alloc(0);
    if (result.Body instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of result.Body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }
    if (result.Body instanceof Uint8Array) {
      return Buffer.from(result.Body);
    }
    if (
      typeof result.Body === "object" &&
      "transformToByteArray" in result.Body &&
      typeof result.Body.transformToByteArray === "function"
    ) {
      return Buffer.from(await result.Body.transformToByteArray());
    }
    throw new Error("Unsupported S3 object body type");
  }

  async getGetUrl(key: string, options?: { downloadFilename?: string }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(options?.downloadFilename
        ? { ResponseContentDisposition: attachmentDisposition(options.downloadFilename) }
        : {}),
    });
    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }
}

function attachmentDisposition(filename: string): string {
  return `attachment; filename="${filename.replace(/["\\]/g, "_")}"`;
}
