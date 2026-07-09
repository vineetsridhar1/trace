export const TRACE_APP_STARTER_FILES: Record<string, string> = {
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
        start: "next start",
        lint: "eslint .",
        typecheck: "tsc --noEmit",
      },
      dependencies: {
        "@radix-ui/react-slot": "1.3.0",
        "class-variance-authority": "0.7.1",
        clsx: "2.1.1",
        "lucide-react": "1.23.0",
        next: "15.5.20",
        react: "19.2.7",
        "react-dom": "19.2.7",
        "tailwind-merge": "3.6.0",
      },
      devDependencies: {
        "@tailwindcss/postcss": "4.3.2",
        "@types/node": "24.5.2",
        "@types/react": "19.2.17",
        "@types/react-dom": "19.2.3",
        eslint: "8.57.1",
        "eslint-config-next": "15.5.20",
        tailwindcss: "4.3.2",
        typescript: "5.7.3",
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
  ".eslintrc.json": `${JSON.stringify(
    {
      extends: ["next/core-web-vitals", "next/typescript"],
    },
    null,
    2,
  )}
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
  "lib/persistence.ts": `export type AppItem = {
  id: string;
  title: string;
  createdAt: string;
};

const globalStore = globalThis as typeof globalThis & {
  __traceAppItems?: AppItem[];
};

function store() {
  globalStore.__traceAppItems ??= [
    {
      id: "welcome",
      title: "Replace this in-memory seam with a database adapter when the app needs durability.",
      createdAt: new Date(0).toISOString(),
    },
  ];
  return globalStore.__traceAppItems;
}

export function listItems() {
  return [...store()];
}

export function createItem(title: string) {
  const item: AppItem = {
    id: crypto.randomUUID(),
    title,
    createdAt: new Date().toISOString(),
  };
  store().unshift(item);
  return item;
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
  "app/api/items/route.ts": `import { NextResponse } from "next/server";
import { createItem, listItems } from "@/lib/persistence";

export async function GET() {
  return NextResponse.json({ items: listItems() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { title?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  return NextResponse.json({ item: createItem(title) }, { status: 201 });
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
    <main
      data-trace-source="app/page.tsx:11"
      className="min-h-screen bg-[var(--background)] px-6 py-10 text-[var(--foreground)]"
    >
      <section data-trace-source="app/page.tsx:15" className="mx-auto flex max-w-5xl flex-col gap-8">
        <div data-trace-source="app/page.tsx:16" className="max-w-3xl">
          <p
            data-trace-source="app/page.tsx:17"
            className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--primary)]"
          >
            Trace app session
          </p>
          <h1
            data-trace-source="app/page.tsx:22"
            className="text-4xl font-semibold tracking-normal sm:text-5xl"
          >
            Build the full-stack app from here.
          </h1>
          <p
            data-trace-source="app/page.tsx:28"
            className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted-foreground)]"
          >
            This managed repo starts with Next.js, Tailwind, shadcn-compatible primitives, a
            preview process, and checkpoint-friendly scripts.
          </p>
          <Button data-trace-source="app/page.tsx:34" className="mt-6">
            Start building
            <ArrowRight size={16} />
          </Button>
        </div>
        <div data-trace-source="app/page.tsx:39" className="grid gap-3 sm:grid-cols-3">
          {tasks.map((task) => (
            <div
              key={task}
              data-trace-source="app/page.tsx:41"
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
            >
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
