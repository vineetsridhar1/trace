import { execFile, spawn } from "child_process";
import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { RepoApplicationConfigInput } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { authenticateProvisionedRuntimeToken } from "../lib/runtime-adapters.js";

const execFileAsync = promisify(execFile);
const DEFAULT_BRANCH = "main";
const GIT_SERVICE_COMMANDS = {
  "git-upload-pack": "upload-pack",
  "git-receive-pack": "receive-pack",
} as const;

type GitService = keyof typeof GIT_SERVICE_COMMANDS;
type PrismaTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const DEFAULT_APP_CONFIG: RepoApplicationConfigInput = {
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

function gitStorageRoot(): string {
  return process.env.GIT_STORAGE_ROOT?.trim() || path.join(process.cwd(), ".trace-managed-git");
}

function assertPublicServerUrl(): URL {
  const raw = process.env.TRACE_SERVER_PUBLIC_URL?.trim();
  if (!raw) {
    throw new Error("TRACE_SERVER_PUBLIC_URL is required for managed git remotes");
  }
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("TRACE_SERVER_PUBLIC_URL must use http:// or https://");
  }
  return url;
}

function managedRepoPath(repoId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(repoId)) {
    throw new Error("Invalid managed repo id");
  }
  return path.join(gitStorageRoot(), `${repoId}.git`);
}

function buildManagedRemoteUrl(organizationId: string, repoId: string): string {
  const url = assertPublicServerUrl();
  url.pathname = `${url.pathname.replace(/\/$/, "")}/git/${organizationId}/${repoId}.git`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function pktLine(value: string): Buffer {
  const payload = Buffer.from(value, "utf8");
  const length = (payload.length + 4).toString(16).padStart(4, "0");
  return Buffer.concat([Buffer.from(length, "ascii"), payload]);
}

function parseBasicPassword(header: string | undefined): string | null {
  if (!header?.startsWith("Basic ")) return null;
  const encoded = header.slice("Basic ".length).trim();
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return null;
  }
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) return null;
  return decoded.slice(separatorIndex + 1);
}

async function ensureAuthorizedRuntime(req: Request, organizationId: string, repoId: string) {
  const token = parseBasicPassword(req.headers.authorization);
  const auth = token ? authenticateProvisionedRuntimeToken(token) : null;
  if (!auth || auth.organizationId !== organizationId) return null;

  const repo = await prisma.repo.findFirst({
    where: { id: repoId, organizationId, provider: "managed" },
    select: { id: true },
  });
  if (!repo) return null;

  const session = await prisma.session.findFirst({
    where: {
      id: auth.sessionId,
      organizationId,
      OR: [{ repoId }, { sessionGroup: { repoId } }],
    },
    select: { id: true },
  });
  return session ? auth : null;
}

async function seedBareRepo(repoPath: string): Promise<void> {
  if (fs.existsSync(repoPath)) return;
  fs.mkdirSync(path.dirname(repoPath), { recursive: true });

  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-managed-git-"));
  try {
    await execFileAsync("git", ["init", "-b", DEFAULT_BRANCH], { cwd: workdir });
    await execFileAsync("git", ["config", "user.name", "Trace"], { cwd: workdir });
    await execFileAsync("git", ["config", "user.email", "trace@trace.dev"], { cwd: workdir });
    writeStarterFiles(workdir);
    await execFileAsync("git", ["add", "."], { cwd: workdir });
    await execFileAsync("git", ["commit", "-m", "Initialize Trace app"], { cwd: workdir });
    await execFileAsync("git", ["init", "--bare", "--initial-branch", DEFAULT_BRANCH, repoPath]);
    await execFileAsync("git", ["remote", "add", "origin", repoPath], { cwd: workdir });
    await execFileAsync("git", ["push", "origin", `${DEFAULT_BRANCH}:${DEFAULT_BRANCH}`], {
      cwd: workdir,
    });
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}

function writeStarterFile(workdir: string, filePath: string, contents: string): void {
  const absolutePath = path.join(workdir, filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
}

function writeStarterFiles(workdir: string): void {
  const files: Record<string, string> = {
    "README.md": `# Trace app

This managed repository stores a standalone Trace app session.

## Scripts

- \`pnpm install\` installs dependencies.
- \`pnpm dev --hostname 0.0.0.0\` starts the preview server on port 3000.
- \`pnpm build\` verifies the app for publishing or handoff.
`,
    "package.json": `${JSON.stringify(
      {
        private: true,
        scripts: {
          dev: "next dev",
          build: "next build",
          lint: "next lint",
          typecheck: "tsc --noEmit",
        },
        dependencies: {
          "@radix-ui/react-slot": "latest",
          "class-variance-authority": "latest",
          clsx: "latest",
          "lucide-react": "latest",
          next: "latest",
          react: "latest",
          "react-dom": "latest",
          "tailwind-merge": "latest",
        },
        devDependencies: {
          "@tailwindcss/postcss": "latest",
          "@types/node": "latest",
          "@types/react": "latest",
          "@types/react-dom": "latest",
          tailwindcss: "latest",
          typescript: "latest",
        },
      },
      null,
      2,
    )}
`,
    "next.config.ts": `import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
`,
    "tsconfig.json": `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2017",
          lib: ["dom", "dom.iterable", "esnext"],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: "esnext",
          moduleResolution: "bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: "preserve",
          incremental: true,
          plugins: [{ name: "next" }],
          paths: { "@/*": ["./*"] },
        },
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        exclude: ["node_modules"],
      },
      null,
      2,
    )}
`,
    "postcss.config.mjs": `const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
`,
    "components.json": `${JSON.stringify(
      {
        $schema: "https://ui.shadcn.com/schema.json",
        style: "new-york",
        rsc: true,
        tsx: true,
        tailwind: {
          css: "app/globals.css",
          baseColor: "neutral",
          cssVariables: true,
        },
        aliases: {
          components: "@/components",
          utils: "@/lib/utils",
          ui: "@/components/ui",
          lib: "@/lib",
          hooks: "@/hooks",
        },
      },
      null,
      2,
    )}
`,
    ".trace/app-starter.json": `${JSON.stringify(
      {
        version: 1,
        framework: "nextjs",
        packageManager: "pnpm",
        devCommand: "pnpm dev --hostname 0.0.0.0",
        previewPort: 3000,
      },
      null,
      2,
    )}
`,
    "trace.tokens.json": `${JSON.stringify(
      {
        color: {
          background: "#f8fafc",
          foreground: "#0f172a",
          primary: "#2563eb",
          muted: "#64748b",
        },
        radius: {
          card: "8px",
          control: "6px",
        },
      },
      null,
      2,
    )}
`,
    "lib/utils.ts": `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`,
    "components/ui/button.tsx": `import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";
`,
    "app/globals.css": `@import "tailwindcss";

:root {
  --background: #f8fafc;
  --foreground: #0f172a;
  --card: #ffffff;
  --card-foreground: #0f172a;
  --primary: #2563eb;
  --primary-foreground: #ffffff;
  --muted: #e2e8f0;
  --muted-foreground: #64748b;
  --accent: #e0f2fe;
  --accent-foreground: #0f172a;
  --border: #cbd5e1;
  --input: #cbd5e1;
  --ring: #2563eb;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}
`,
    "app/layout.tsx": `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trace app",
  description: "A standalone app built in Trace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
    "app/page.tsx": `import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const tasks = [
  "Edit app/page.tsx to replace this starter.",
  "Run pnpm dev --hostname 0.0.0.0 for preview.",
  "Commit checkpoints as the app evolves.",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-10 text-[var(--foreground)]">
      <section className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--primary)]">
            Trace app session
          </p>
          <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">
            Build the full-stack app from here.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted-foreground)]">
            This managed repo starts with Next.js, Tailwind, shadcn-compatible primitives, a
            preview process, and checkpoint-friendly scripts.
          </p>
          <Button className="mt-6">
            Start building
            <ArrowRight size={16} />
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {tasks.map((task) => (
            <div key={task} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
              <CheckCircle2 className="mb-3 text-[var(--primary)]" size={20} />
              <p className="text-sm leading-6 text-[var(--card-foreground)]">{task}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
`,
  };

  for (const [filePath, contents] of Object.entries(files)) {
    writeStarterFile(workdir, filePath, contents);
  }
}

function buildDefaultAppSetupConfig(): Prisma.InputJsonValue {
  return {
    applications: DEFAULT_APP_CONFIG,
    appStarter: {
      version: 1,
      framework: "nextjs",
      packageManager: "pnpm",
    },
  } as Prisma.InputJsonValue;
}

function runGitHttpService(input: {
  reqBody?: Buffer;
  res: Response;
  service: GitService;
  repoPath: string;
  advertiseRefs?: boolean;
}) {
  const command = GIT_SERVICE_COMMANDS[input.service];
  const args = [
    command,
    "--stateless-rpc",
    ...(input.advertiseRefs ? ["--advertise-refs"] : []),
    input.repoPath,
  ];
  const child = spawn("git", args, { stdio: ["pipe", "pipe", "pipe"] });
  const stderr: Buffer[] = [];

  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  child.on("error", (error) => {
    if (!input.res.headersSent) input.res.status(500);
    input.res.end(error.message);
  });
  child.on("close", (code) => {
    if (code === 0 || input.res.writableEnded) return;
    const message = Buffer.concat(stderr).toString("utf8") || `git ${command} failed`;
    if (!input.res.headersSent) input.res.status(500);
    input.res.end(message);
  });

  if (input.advertiseRefs) {
    input.res.write(pktLine(`# service=${input.service}\n`));
    input.res.write(Buffer.from("0000", "ascii"));
  } else {
    child.stdin.end(input.reqBody ?? Buffer.alloc(0));
  }
  child.stdout.pipe(input.res);
  if (input.advertiseRefs) child.stdin.end();
}

export const managedGitService = {
  defaultBranch: DEFAULT_BRANCH,

  buildManagedRemoteUrl,

  async prepareBareRepo(repoId: string): Promise<string> {
    const repoPath = managedRepoPath(repoId);
    await seedBareRepo(repoPath);
    return repoPath;
  },

  async createAppRepo(input: {
    organizationId: string;
    name: string;
    tx?: PrismaTx;
  }): Promise<{ id: string; name: string; remoteUrl: string; defaultBranch: string }> {
    const repoId = randomUUID();
    const repoName = input.name.trim().slice(0, 80) || "Trace app";
    const remoteUrl = buildManagedRemoteUrl(input.organizationId, repoId);
    await this.prepareBareRepo(repoId);
    const db = input.tx ?? prisma;
    await db.repo.create({
      data: {
        id: repoId,
        organizationId: input.organizationId,
        name: repoName,
        provider: "managed",
        remoteUrl,
        defaultBranch: DEFAULT_BRANCH,
        setupConfig: buildDefaultAppSetupConfig(),
      },
    });
    return { id: repoId, name: repoName, remoteUrl, defaultBranch: DEFAULT_BRANCH };
  },

  async handleInfoRefs(req: Request, res: Response, params: { orgId: string; repoId: string }) {
    const service = typeof req.query.service === "string" ? req.query.service : "";
    if (service !== "git-upload-pack" && service !== "git-receive-pack") {
      res.status(400).json({ error: "Unsupported git service" });
      return;
    }
    const auth = await ensureAuthorizedRuntime(req, params.orgId, params.repoId);
    if (!auth) {
      res.set("WWW-Authenticate", 'Basic realm="Trace managed git"');
      res.status(401).end("Unauthorized");
      return;
    }
    res.type(`application/x-${service}-advertisement`);
    res.set("Cache-Control", "no-cache");
    runGitHttpService({
      res,
      service,
      repoPath: managedRepoPath(params.repoId),
      advertiseRefs: true,
    });
  },

  async handleRpc(
    req: Request,
    res: Response,
    params: { orgId: string; repoId: string; service: GitService },
  ) {
    const auth = await ensureAuthorizedRuntime(req, params.orgId, params.repoId);
    if (!auth) {
      res.set("WWW-Authenticate", 'Basic realm="Trace managed git"');
      res.status(401).end("Unauthorized");
      return;
    }
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.type(`application/x-${params.service}-result`);
    res.set("Cache-Control", "no-cache");
    runGitHttpService({
      reqBody: body,
      res,
      service: params.service,
      repoPath: managedRepoPath(params.repoId),
    });
  },
};
