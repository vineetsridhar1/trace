import type { QueryResolvers } from "./../../../types.generated";
import { generateStructured } from "../../../../services/aiService";

interface SuggestScriptsResult {
  setupScript: string;
  runScript: string;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are a DevOps expert helping configure setup and run scripts for a software project inside Trace, a Mac app that runs coding agents in isolated git worktrees.

## How Trace worktrees work
- Each task gets an ISOLATED GIT WORKTREE — a full checkout of the repo on a fresh branch
- The worktree is created in a separate directory, NOT inside the original repo
- The original repo is accessible as a sibling directory at a relative path like ../repo-name
- Scripts execute in the worktree root directory with \`sh -c "set -e\\n{script}"\`
- set -e is pre-applied: any failing command aborts the script

## Two script types

### Setup Script (runs ONCE when the worktree is first created)
Purpose: Prepare the worktree so the coding agent can immediately start working.
Common tasks:
- Copy environment files from the original repo: \`cp ../repo-name/.env .env\`
- Install dependencies: npm install, pip install -r requirements.txt, bundle install, etc.
- Build steps if needed before development
- Database setup/migration (only if lightweight and local)

### Run Script (runs each time the user clicks "play")
Purpose: Start the development server as a foreground process.
Common tasks:
- Start dev server: npm run dev, python manage.py runserver, go run ., etc.

## Available environment variables (at runtime, not in setup scripts)
- $PORT — primary allocated port (same as $TRACE_PORT_0)
- $TRACE_PORT_0 through $TRACE_PORT_9 — 10 allocated ports for multi-service setups
- $REPO_FOLDER — the worktree directory path

## Rules
1. Setup script must be IDEMPOTENT (safe to run multiple times)
2. Run script must start a FOREGROUND process (not background/daemon)
3. Use $PORT for the primary server port binding, never hardcode ports
4. If .env.example or .env.template exists, the actual .env is likely in the original repo — suggest copying it
5. If the README describes setup steps, follow those instructions
6. For monorepos, include cd commands to the relevant subdirectory if needed
7. Keep scripts minimal — only what's needed to get the project running
8. Do NOT include git commands (clone, pull, checkout) — the worktree is already set up`;

export const suggestScripts: NonNullable<QueryResolvers['suggestScripts']> = async (_parent, { fileContents }) => {
  const contents = fileContents as Record<string, string>;
  const fileList = Object.entries(contents)
    .map(([name, content]) => `### ${name}\n\`\`\`\n${content}\n\`\`\``)
    .join("\n\n");

  const prompt = `Analyze the following project files and generate setup and run scripts.\n\n${fileList}`;

  const result = await generateStructured<SuggestScriptsResult>({
    system: SYSTEM_PROMPT,
    prompt,
    toolName: "suggest_scripts",
    toolDescription: "Generate setup and run scripts for the project",
    schema: {
      type: "object",
      properties: {
        setupScript: {
          type: "string",
          description:
            "Multi-line shell script for one-time worktree setup. Each line is a command. Empty string if no setup needed.",
        },
        runScript: {
          type: "string",
          description:
            "Shell command(s) to start the dev server, should bind to $PORT. Empty string if no run script applicable.",
        },
        reasoning: {
          type: "string",
          description:
            "Brief explanation of what was detected and why these scripts were chosen",
        },
      },
      required: ["setupScript", "runScript", "reasoning"],
    },
    maxTokens: 1024,
  });

  return result;
};
