import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket = process.env.S3_BUCKET;
const region = process.env.AWS_REGION;

if (!bucket) {
  throw new Error("Missing required environment variable S3_BUCKET");
}

if (!region) {
  throw new Error("Missing required environment variable AWS_REGION");
}

export const S3_BUCKET = bucket;
export const AWS_REGION = region;

export const s3 = new S3Client({
  region: AWS_REGION,
});

export async function getPresignedGetUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn });
}
