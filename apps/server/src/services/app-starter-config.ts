import { Prisma } from "@prisma/client";
import type { RepoApplicationConfigInput } from "@trace/gql";

export const DEFAULT_APP_CONFIG: RepoApplicationConfigInput = {
  setupScripts: [
    {
      id: "install",
      name: "Install dependencies",
      command: "pnpm install",
      workingDirectory: ".",
      env: [],
    },
    {
      id: "build",
      name: "Build app",
      command: "pnpm build",
      workingDirectory: ".",
      env: [],
    },
  ],
  applications: [
    {
      id: "web",
      name: "Web app",
      processes: [
        {
          id: "dev",
          name: "Next.js dev server",
          command: "pnpm dev --hostname 0.0.0.0",
          workingDirectory: ".",
          env: [],
          required: true,
          ports: [
            {
              id: "web",
              label: "Web",
              port: 3000,
              protocol: "http",
              defaultForwardingEnabled: true,
              healthPath: "/",
            },
          ],
        },
      ],
    },
  ],
};

export function buildDefaultAppSetupConfig(): Prisma.InputJsonValue {
  return {
    applications: DEFAULT_APP_CONFIG,
    appStarter: {
      version: 1,
      framework: "nextjs",
      packageManager: "pnpm",
    },
  } as Prisma.InputJsonValue;
}
