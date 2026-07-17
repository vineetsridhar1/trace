import { spawn } from "node:child_process";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import {
  APP_DEPLOYMENT_JOB_VERSION,
  assertValidCommitSha,
  type AppDeploymentJob,
} from "@trace/shared";
import { gitStorage } from "../lib/git-storage/index.js";

const MAX_SOURCE_BUNDLE_BYTES = 100 * 1024 * 1024;

export type AppDeploymentDispatchInput = Omit<AppDeploymentJob, "source" | "version">;

export interface AppDeploymentDispatcher {
  enqueue(input: AppDeploymentDispatchInput): Promise<{ externalJobId: string | null }>;
}

type AwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

async function archiveCheckpoint(repoPath: string, commitSha: string): Promise<Buffer> {
  assertValidCommitSha(commitSha);
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["--git-dir", repoPath, "archive", "--format=tar.gz", commitSha], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_SOURCE_BUNDLE_BYTES) {
        child.kill();
        reject(new Error("App source bundle exceeds the 100 MB deployment limit"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(stdout));
      else
        reject(new Error(Buffer.concat(stderr).toString("utf8") || "Unable to archive checkpoint"));
    });
  });
}

async function deploymentCredentials(region: string, roleArn: string): Promise<AwsCredentials> {
  const response = await new STSClient({ region }).send(
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
  return {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    ...(credentials.SessionToken ? { sessionToken: credentials.SessionToken } : {}),
  };
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
    const body = await archiveCheckpoint(repoPath, input.commitSha);
    const sourceKey = `app-deployments/${input.organizationId}/${input.deploymentId}/${input.commitSha}.tar.gz`;
    const credentials = await deploymentCredentials(region, roleArn);
    await new S3Client({ region, credentials }).send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: sourceKey,
        Body: body,
        ContentType: "application/gzip",
        Metadata: {
          deploymentId: input.deploymentId,
          commitSha: input.commitSha,
        },
      }),
    );

    const job: AppDeploymentJob = {
      ...input,
      version: APP_DEPLOYMENT_JOB_VERSION,
      source: { bucket, key: sourceKey },
    };
    const result = await new SQSClient({ region, credentials }).send(
      new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(job) }),
    );
    return { externalJobId: result.MessageId ?? null };
  }
}

export const appDeploymentDispatcher: AppDeploymentDispatcher = new AwsAppDeploymentDispatcher();
