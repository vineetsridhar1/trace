import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface LocalProject {
  name: string;
  path: string;
  remoteUrl: null;
  defaultBranch: string;
}

export interface CreateLocalProjectDeps {
  readdir: typeof fs.promises.readdir;
  mkdir: typeof fs.promises.mkdir;
  execFile: (args: string[], cwd: string) => Promise<void>;
}

const defaultDeps: CreateLocalProjectDeps = {
  readdir: fs.promises.readdir,
  mkdir: fs.promises.mkdir,
  execFile: async (args, cwd) => {
    await execFileAsync("git", args, { cwd });
  },
};

export async function createLocalProjectOnDisk(
  input: { name?: string; parentPath?: string },
  deps: CreateLocalProjectDeps = defaultDeps,
): Promise<LocalProject> {
  const name = input.name?.trim();
  const parentPath = input.parentPath;
  if (!name) throw new Error("Project name is required.");
  if (!parentPath) throw new Error("Project location is required.");
  if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error("Project name cannot contain path separators.");
  }

  const projectPath = path.join(parentPath, name);
  const existingEntries = await deps.readdir(projectPath).catch((error: unknown) => {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  });

  if (existingEntries && existingEntries.length > 0) {
    throw new Error("A non-empty folder already exists at that location.");
  }

  if (!existingEntries) {
    await deps.mkdir(projectPath, { recursive: false });
  }

  try {
    await deps.execFile(["init", "-b", "main"], projectPath);
  } catch {
    await deps.execFile(["init"], projectPath);
    await deps.execFile(["symbolic-ref", "HEAD", "refs/heads/main"], projectPath);
  }
  await deps.execFile(
    [
      "-c",
      "user.name=Trace",
      "-c",
      "user.email=trace@localhost",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-m",
      "Initial commit",
    ],
    projectPath,
  );

  return {
    name,
    path: projectPath,
    remoteUrl: null,
    defaultBranch: "main",
  };
}
