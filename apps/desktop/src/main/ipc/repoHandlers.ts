import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ipcMain } from "electron";
import { runProcess } from "../process";
import { resolveServerUrl } from "./shared";
import { registerRelayAction } from "../instanceCommandHandler";

const LIST_REPO_FILES_CHANNEL = "list-repo-files";
const SUGGEST_SCRIPTS_CHANNEL = "suggest-scripts";
const VALIDATE_REPO_CHANNEL = "validate-repo";
const LIST_SLASH_COMMANDS_CHANNEL = "list-slash-commands";
const READ_PRODUCT_DOC_FILE_CHANNEL = "read-product-doc-file";
const WRITE_PRODUCT_DOC_FILE_CHANNEL = "write-product-doc-file";

const FILE_SPECS: Array<{ patterns: string[]; maxChars: number }> = [
  { patterns: ["README.md"], maxChars: 5000 },
  { patterns: ["CONTRIBUTING.md"], maxChars: 3000 },
  { patterns: ["package.json"], maxChars: 4000 },
  { patterns: ["Makefile"], maxChars: 3000 },
  { patterns: ["docker-compose.yml", "docker-compose.yaml"], maxChars: 3000 },
  {
    patterns: [".env.example", ".env.template", ".env.sample"],
    maxChars: 2000,
  },
  { patterns: ["requirements.txt"], maxChars: 2000 },
  { patterns: ["pyproject.toml"], maxChars: 3000 },
  { patterns: ["go.mod"], maxChars: 2000 },
  { patterns: ["Gemfile"], maxChars: 2000 },
  { patterns: ["Cargo.toml"], maxChars: 2000 },
  { patterns: ["Procfile"], maxChars: 1000 },
];

function readProjectFiles(repoPath: string): Record<string, string> {
  const contents: Record<string, string> = {};

  contents["_repoName"] = path.basename(repoPath);

  for (const spec of FILE_SPECS) {
    for (const pattern of spec.patterns) {
      const filePath = path.join(repoPath, pattern);
      try {
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, "utf-8");
          contents[pattern] = raw.slice(0, spec.maxChars);
        }
      } catch {
        /* ignore read errors */
      }
    }
  }

  return contents;
}

async function readDirectoryListing(repoPath: string): Promise<string | null> {
  try {
    const result = await runProcess("git", ["ls-files"], repoPath);
    if (result.code !== 0) return null;
    const lines = result.stdout.split("\n").slice(0, 100).join("\n");
    return lines.slice(0, 3000);
  } catch {
    return null;
  }
}

async function aiSuggestScripts(repoPath: string): Promise<{
  success: boolean;
  setupScript?: string;
  runScript?: string;
  reasoning?: string;
} | null> {
  const fileContents = readProjectFiles(repoPath);

  const dirListing = await readDirectoryListing(repoPath);
  if (dirListing) {
    fileContents["_directoryListing"] = dirListing;
  }

  const serverUrl = resolveServerUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${serverUrl}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query SuggestScripts($fileContents: JSON!) {
          suggestScripts(fileContents: $fileContents) {
            setupScript
            runScript
            reasoning
          }
        }`,
        variables: { fileContents },
      }),
      signal: controller.signal,
    });

    const json = (await res.json()) as {
      data?: {
        suggestScripts?: {
          setupScript?: string;
          runScript?: string;
          reasoning?: string;
        };
      };
    };
    const data = json.data?.suggestScripts;
    if (!data) return null;

    return {
      success: true,
      setupScript: data.setupScript || undefined,
      runScript: data.runScript || undefined,
      reasoning: data.reasoning || undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function heuristicSuggestScripts(repoPath: string): {
  success: boolean;
  setupScript?: string;
  runScript?: string;
  error?: string;
} {
  const setupParts: string[] = [];
  let runScript: string | undefined;

  const pkgPath = path.join(repoPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const scripts = pkg.scripts ?? {};
      setupParts.push("npm install");
      if (scripts.dev) {
        runScript = "PORT=$PORT npm run dev";
      } else if (scripts.start) {
        runScript = "PORT=$PORT npm start";
      }
    } catch {
      /* ignore parse errors */
    }
  }

  if (
    fs.existsSync(path.join(repoPath, "docker-compose.yml")) ||
    fs.existsSync(path.join(repoPath, "docker-compose.yaml"))
  ) {
    if (!runScript) runScript = "docker compose up";
  }

  if (fs.existsSync(path.join(repoPath, "requirements.txt"))) {
    setupParts.push("pip install -r requirements.txt");
  }

  if (fs.existsSync(path.join(repoPath, "go.mod"))) {
    setupParts.push("go mod download");
    if (!runScript) runScript = "PORT=$PORT go run .";
  }

  const makefilePath = path.join(repoPath, "Makefile");
  if (fs.existsSync(makefilePath)) {
    try {
      const makefile = fs.readFileSync(makefilePath, "utf-8");
      const targets =
        makefile
          .match(/^([a-zA-Z_-]+)\s*:/gm)
          ?.map((t) => t.replace(":", "").trim()) ?? [];
      if (!runScript) {
        if (targets.includes("dev")) runScript = "make dev";
        else if (targets.includes("start")) runScript = "make start";
      }
    } catch {
      /* ignore read errors */
    }
  }

  return {
    success: true,
    setupScript: setupParts.length > 0 ? setupParts.join("\n") : undefined,
    runScript,
  };
}

export function registerRepoHandlers(): void {
  ipcMain.removeHandler(LIST_REPO_FILES_CHANNEL);
  ipcMain.handle(LIST_REPO_FILES_CHANNEL, async (_event, repoPath: string) => {
    try {
      return await doListRepoFiles(repoPath);
    } catch (err) {
      return { success: false, error: String(err), files: [] };
    }
  });

  ipcMain.removeHandler(SUGGEST_SCRIPTS_CHANNEL);
  ipcMain.handle(SUGGEST_SCRIPTS_CHANNEL, async (_event, repoPath: string) => {
    try {
      // Try AI-powered suggestion first, fall back to heuristic
      const aiResult = await aiSuggestScripts(repoPath);
      if (aiResult) return aiResult;
      return heuristicSuggestScripts(repoPath);
    } catch (err) {
      // If AI fails entirely, fall back to heuristic
      try {
        return heuristicSuggestScripts(repoPath);
      } catch (heuristicErr) {
        return { success: false, error: String(heuristicErr) };
      }
    }
  });

  ipcMain.removeHandler(VALIDATE_REPO_CHANNEL);
  ipcMain.handle(VALIDATE_REPO_CHANNEL, async (_event, repoPath: string) => {
    try {
      return await doValidateRepo(repoPath);
    } catch (err) {
      return { valid: false, error: String(err) };
    }
  });

  ipcMain.removeHandler(LIST_SLASH_COMMANDS_CHANNEL);
  ipcMain.handle(LIST_SLASH_COMMANDS_CHANNEL, (_event, repoPath: string) => {
    try {
      return doListSlashCommands(repoPath);
    } catch (err) {
      return { success: false, commands: [], error: String(err) };
    }
  });

  // ─── Product Doc file operations ───────────────────────────────────
  ipcMain.removeHandler(READ_PRODUCT_DOC_FILE_CHANNEL);
  ipcMain.handle(
    READ_PRODUCT_DOC_FILE_CHANNEL,
    async (_event, filePath: string) => {
      try {
        if (!fs.existsSync(filePath)) {
          return { success: true, content: "" };
        }
        const content = fs.readFileSync(filePath, "utf-8");
        return { success: true, content };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );

  ipcMain.removeHandler(WRITE_PRODUCT_DOC_FILE_CHANNEL);
  ipcMain.handle(
    WRITE_PRODUCT_DOC_FILE_CHANNEL,
    async (_event, filePath: string, content: string) => {
      try {
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content, "utf-8");
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },
  );
}

async function doListRepoFiles(repoPath: string) {
  const result = await runProcess("git", ["ls-files"], repoPath);
  if (result.code !== 0) {
    return { success: false, error: result.stderr, files: [] };
  }
  const files = result.stdout
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
  return { success: true, files };
}

async function doValidateRepo(repoPath: string) {
  const revParse = await runProcess(
    "git",
    ["rev-parse", "--is-inside-work-tree"],
    repoPath,
  );
  if (revParse.code !== 0 || revParse.stdout.trim() !== "true") {
    return { valid: false, error: "Not a git repository" };
  }
  const remote = await runProcess(
    "git",
    ["remote", "get-url", "origin"],
    repoPath,
  );
  const originUrl = remote.code === 0 ? remote.stdout.trim() || null : null;
  if (!originUrl) {
    return {
      valid: false,
      error:
        "No origin remote found. Please add an origin remote to this repository.",
    };
  }
  return { valid: true, originUrl };
}

function doListSlashCommands(repoPath: string) {
  type DiscoveredCommand = {
    name: string;
    description: string;
    source: "global" | "project";
  };

  function parseFrontmatter(content: string) {
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fmMatch) return {};
    const fm: Record<string, string> = {};
    for (const line of fmMatch[1].split("\n")) {
      const m = line.match(/^(\w[\w-]*):\s*(.+)$/);
      if (m) fm[m[1]] = m[2].trim();
    }
    return fm;
  }

  function discoverCommands(
    dir: string,
    source: "global" | "project",
  ): DiscoveredCommand[] {
    if (!fs.existsSync(dir)) return [];
    try {
      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".md") && f !== "CLAUDE.md")
        .map((file) => {
          let description = "";
          try {
            const content = fs.readFileSync(path.join(dir, file), "utf-8");
            const fm = parseFrontmatter(content);
            if (fm.description) description = fm.description;
          } catch {
            /* ignore read errors */
          }
          return { name: file.replace(/\.md$/, ""), description, source };
        });
    } catch {
      return [];
    }
  }

  function discoverSkills(
    dir: string,
    source: "global" | "project",
  ): DiscoveredCommand[] {
    if (!fs.existsSync(dir)) return [];
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
          const skillFile = path.join(dir, entry.name, "SKILL.md");
          if (!fs.existsSync(skillFile)) return [];
          try {
            const content = fs.readFileSync(skillFile, "utf-8");
            const fm = parseFrontmatter(content);
            if (fm["user-invocable"] === "false") return [];
            return [
              {
                name: fm.name || entry.name,
                description: fm.description || "",
                source,
              },
            ];
          } catch {
            return [];
          }
        });
    } catch {
      return [];
    }
  }

  function discoverPluginCommands(repoPath: string): DiscoveredCommand[] {
    const homeDir = os.homedir();
    const installedPath = path.join(
      homeDir,
      ".claude",
      "plugins",
      "installed_plugins.json",
    );
    const settingsPath = path.join(homeDir, ".claude", "settings.json");
    if (!fs.existsSync(installedPath)) return [];

    let installed: {
      plugins: Record<
        string,
        Array<{
          scope: string;
          projectPath?: string;
          installPath: string;
        }>
      >;
    };
    try {
      installed = JSON.parse(fs.readFileSync(installedPath, "utf-8"));
    } catch {
      return [];
    }

    let enabledPlugins: Record<string, boolean> = {};
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      enabledPlugins = settings.enabledPlugins ?? {};
    } catch {
      /* no settings, treat all as enabled */
    }

    const results: DiscoveredCommand[] = [];
    for (const [pluginKey, installations] of Object.entries(
      installed.plugins ?? {},
    )) {
      if (enabledPlugins[pluginKey] === false) continue;

      for (const install of installations) {
        if (install.scope === "project" && install.projectPath !== repoPath)
          continue;
        if (!fs.existsSync(install.installPath)) continue;

        const pluginJsonPath = path.join(
          install.installPath,
          ".claude-plugin",
          "plugin.json",
        );
        let pluginName = pluginKey.split("@")[0];
        try {
          const pluginJson = JSON.parse(
            fs.readFileSync(pluginJsonPath, "utf-8"),
          );
          if (pluginJson.name) pluginName = pluginJson.name;
        } catch {
          /* use fallback name */
        }

        const commandsDir = path.join(install.installPath, "commands");
        for (const cmd of discoverCommands(commandsDir, "global")) {
          results.push({ ...cmd, name: `${pluginName}:${cmd.name}` });
        }

        const skillsDir = path.join(install.installPath, "skills");
        for (const skill of discoverSkills(skillsDir, "global")) {
          results.push({ ...skill, name: skill.name });
        }
      }
    }
    return results;
  }

  const homeDir = os.homedir();
  const globalSkillsDir = path.join(homeDir, ".claude", "skills");
  const globalCommandsDir = path.join(homeDir, ".claude", "commands");
  const all = [
    ...discoverSkills(globalSkillsDir, "global"),
    ...discoverCommands(globalCommandsDir, "global"),
    ...discoverPluginCommands(repoPath),
  ];

  if (repoPath) {
    const projectSkillsDir = path.join(repoPath, ".claude", "skills");
    const projectCommandsDir = path.join(repoPath, ".claude", "commands");
    all.push(
      ...discoverSkills(projectSkillsDir, "project"),
      ...discoverCommands(projectCommandsDir, "project"),
    );
  }

  const byName = new Map<string, DiscoveredCommand>();
  for (const cmd of all) {
    byName.set(cmd.name, cmd);
  }

  return { success: true, commands: Array.from(byName.values()) };
}

export function registerRepoRelayActions(): void {
  registerRelayAction("listRepoFiles", async (params) => {
    const { repoPath } = params as { repoPath: string };
    return doListRepoFiles(repoPath);
  });

  registerRelayAction("suggestScripts", async (params) => {
    const { repoPath } = params as { repoPath: string };
    const aiResult = await aiSuggestScripts(repoPath);
    if (aiResult) return aiResult;
    return heuristicSuggestScripts(repoPath);
  });

  registerRelayAction("validateRepo", async (params) => {
    const { repoPath } = params as { repoPath: string };
    const result = await doValidateRepo(repoPath);
    return { success: result.valid, ...result };
  });

  registerRelayAction("listSlashCommands", async (params) => {
    const { repoPath } = params as { repoPath: string };
    return doListSlashCommands(repoPath);
  });

  registerRelayAction("readProductDocFile", async (params) => {
    const { filePath } = params as { filePath: string };
    if (!fs.existsSync(filePath)) {
      return { success: true, content: "" };
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return { success: true, content };
  });

  registerRelayAction("writeProductDocFile", async (params) => {
    const { filePath, content } = params as {
      filePath: string;
      content: string;
    };
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
    return { success: true };
  });
}
