import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ipcMain } from "electron";
import { runProcess } from "../process";

const LIST_REPO_FILES_CHANNEL = "list-repo-files";
const SUGGEST_SCRIPTS_CHANNEL = "suggest-scripts";
const VALIDATE_REPO_CHANNEL = "validate-repo";
const LIST_SLASH_COMMANDS_CHANNEL = "list-slash-commands";
const READ_PRODUCT_DOC_FILE_CHANNEL = "read-product-doc-file";
const WRITE_PRODUCT_DOC_FILE_CHANNEL = "write-product-doc-file";

export function registerRepoHandlers(): void {
  ipcMain.removeHandler(LIST_REPO_FILES_CHANNEL);
  ipcMain.handle(LIST_REPO_FILES_CHANNEL, async (_event, repoPath: string) => {
    try {
      const result = await runProcess("git", ["ls-files"], repoPath);
      if (result.code !== 0) {
        return { success: false, error: result.stderr, files: [] };
      }
      const files = result.stdout
        .split("\n")
        .map((f) => f.trim())
        .filter((f) => f.length > 0);
      return { success: true, files };
    } catch (err) {
      return { success: false, error: String(err), files: [] };
    }
  });

  ipcMain.removeHandler(SUGGEST_SCRIPTS_CHANNEL);
  ipcMain.handle(SUGGEST_SCRIPTS_CHANNEL, async (_event, repoPath: string) => {
    try {
      const setupParts: string[] = [];
      let runScript: string | undefined;

      // Check package.json
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

      // Check docker-compose
      if (
        fs.existsSync(path.join(repoPath, "docker-compose.yml")) ||
        fs.existsSync(path.join(repoPath, "docker-compose.yaml"))
      ) {
        if (!runScript) runScript = "docker compose up";
      }

      // Check Python requirements.txt
      if (fs.existsSync(path.join(repoPath, "requirements.txt"))) {
        setupParts.push("pip install -r requirements.txt");
      }

      // Check Go go.mod
      if (fs.existsSync(path.join(repoPath, "go.mod"))) {
        setupParts.push("go mod download");
        if (!runScript) runScript = "PORT=$PORT go run .";
      }

      // Check Makefile for dev/start targets
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
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.removeHandler(VALIDATE_REPO_CHANNEL);
  ipcMain.handle(VALIDATE_REPO_CHANNEL, async (_event, repoPath: string) => {
    try {
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
    } catch (err) {
      return { valid: false, error: String(err) };
    }
  });

  ipcMain.removeHandler(LIST_SLASH_COMMANDS_CHANNEL);
  ipcMain.handle(LIST_SLASH_COMMANDS_CHANNEL, (_event, repoPath: string) => {
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
            return {
              name: file.replace(/\.md$/, ""),
              description,
              source,
            };
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

    try {
      const homeDir = os.homedir();
      const globalSkillsDir = path.join(homeDir, ".claude", "skills");
      const globalCommandsDir = path.join(homeDir, ".claude", "commands");
      // Global first, then project — project overwrites global during dedup
      const all = [
        ...discoverSkills(globalSkillsDir, "global"),
        ...discoverCommands(globalCommandsDir, "global"),
      ];

      if (repoPath) {
        const projectSkillsDir = path.join(repoPath, ".claude", "skills");
        const projectCommandsDir = path.join(repoPath, ".claude", "commands");
        all.push(
          ...discoverSkills(projectSkillsDir, "project"),
          ...discoverCommands(projectCommandsDir, "project"),
        );
      }

      // Dedup by name — last entry wins (project takes precedence)
      const byName = new Map<string, DiscoveredCommand>();
      for (const cmd of all) {
        byName.set(cmd.name, cmd);
      }

      return { success: true, commands: Array.from(byName.values()) };
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
