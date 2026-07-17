import { spawn } from "node:child_process";
import { Transform } from "node:stream";
import { S3Client } from "@aws-sdk/client-s3";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { Upload } from "@aws-sdk/lib-storage";
import {
  APP_DEPLOYMENT_JOB_VERSION,
  assertValidCommitSha,
  type AppDeploymentJob,
} from "@trace/shared";
import { gitStorage } from "../lib/git-storage/index.js";

const MAX_SOURCE_BUNDLE_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_ERROR_BYTES = 64 * 1024;
const stsClients = new Map<string, STSClient>();
const deploymentClientCache = new Map<
  string,
  { s3: S3Client; sqs: SQSClient; expiresAt: number }
>();

export type AppDeploymentDispatchInput = Omit<AppDeploymentJob, "source" | "version">;

export interface AppDeploymentDispatcher {
  enqueue(input: AppDeploymentDispatchInput): Promise<{ externalJobId: string | null }>;
}

type AwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

export function createSourceBundleLimiter(maxBytes = MAX_SOURCE_BUNDLE_BYTES): Transform {
  let size = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      size += chunk.byteLength;
      if (size > maxBytes) {
        done(
          new Error(
            `App source bundle exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB deployment limit`,
          ),
        );
        return;
      }
      done(null, chunk);
    },
  });
}

async function uploadCheckpoint(
  client: S3Client,
  bucket: string,
  key: string,
  repoPath: string,
  commitSha: string,
  deploymentId: string,
): Promise<void> {
  assertValidCommitSha(commitSha);
  const child = spawn("git", ["--git-dir", repoPath, "archive", "--format=tar.gz", commitSha], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  const limiter = createSourceBundleLimiter();
  limiter.on("error", () => child.kill());
  child.stderr.on("data", (chunk: Buffer) => {
    if (stderr.length < MAX_ARCHIVE_ERROR_BYTES) stderr += chunk.toString("utf8");
  });
  child.stdout.pipe(limiter, { end: false });

  const upload = new Upload({
    client,
    leavePartsOnError: false,
    params: {
      Bucket: bucket,
      Key: key,
      Body: limiter,
      ContentType: "application/gzip",
      Metadata: { deploymentId, commitSha },
    },
  });
  const archived = new Promise<void>((resolve, reject) => {
    child.on("error", (error) => {
      limiter.destroy(error);
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        limiter.end();
        resolve();
      } else {
        const error = new Error(stderr.trim() || "Unable to archive checkpoint");
        limiter.destroy(error);
        reject(error);
      }
    });
  });
  try {
    await Promise.all([archived, upload.done()]);
  } catch (error) {
    child.kill();
    await upload.abort().catch(() => undefined);
    throw error;
  }
}

async function deploymentClients(
  region: string,
  roleArn: string,
): Promise<{ s3: S3Client; sqs: SQSClient }> {
  const cacheKey = `${region}:${roleArn}`;
  const cached = deploymentClientCache.get(cacheKey);
  if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) return cached;
  let client = stsClients.get(region);
  if (!client) {
    client = new STSClient({ region });
    stsClients.set(region, client);
  }
  const response = await client.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: "trace-app-deployment-publisher",
      DurationSeconds: 3600,
    }),
  );
  const credentials = response.Credentials;
  if (!credentials?.AccessKeyId || !credentials.SecretAccessKey) {
    throw new Error("AWS did not return app deployment credentials");
  }
  const awsCredentials: AwsCredentials = {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    ...(credentials.SessionToken ? { sessionToken: credentials.SessionToken } : {}),
  };
  const clients = {
    s3: new S3Client({ region, credentials: awsCredentials }),
    sqs: new SQSClient({ region, credentials: awsCredentials }),
    expiresAt: credentials.Expiration?.getTime() ?? Date.now() + 55 * 60 * 1000,
  };
  deploymentClientCache.set(cacheKey, clients);
  return clients;
}

export class AwsAppDeploymentDispatcher implements AppDeploymentDispatcher {
  async enqueue(input: AppDeploymentDispatchInput) {
    const region = process.env.AWS_REGION;
    const roleArn = process.env.TRACE_APP_DEPLOYMENT_ROLE_ARN;
    const bucket = process.env.TRACE_APP_BUILD_SOURCE_BUCKET;
    const queueUrl = process.env.TRACE_APP_DEPLOYMENT_QUEUE_URL;
    if (!region || !roleArn || !bucket || !queueUrl) {
      throw new Error("Published app deployments are not configured for this environment");
    }

    const repoPath = gitStorage.resolveRepoPath(input.organizationId, input.repoId);
    const sourceKey = `app-deployments/${input.organizationId}/${input.deploymentId}/${input.commitSha}.tar.gz`;
    const clients = await deploymentClients(region, roleArn);
    await uploadCheckpoint(
      clients.s3,
      bucket,
      sourceKey,
      repoPath,
      input.commitSha,
      input.deploymentId,
    );

    const job: AppDeploymentJob = {
      ...input,
      version: APP_DEPLOYMENT_JOB_VERSION,
      source: { bucket, key: sourceKey },
    };
    const result = await clients.sqs.send(
      new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(job) }),
    );
    return { externalJobId: result.MessageId ?? null };
  }
}

export const appDeploymentDispatcher: AppDeploymentDispatcher = new AwsAppDeploymentDispatcher();
