import fs from 'node:fs';
import path from 'node:path';
import type { QueryResolvers } from './../../../types.generated';

export const suggestScripts: NonNullable<QueryResolvers['suggestScripts']> = async (_parent, { localRepoPath }) => {
  const setupParts: string[] = [];
  let runScript: string | null = null;

  // Check package.json
  const packageJsonPath = path.join(localRepoPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const scripts = pkg.scripts ?? {};

      setupParts.push('npm install');

      if (scripts.dev) {
        runScript = 'PORT=$PORT npm run dev';
      } else if (scripts.start) {
        runScript = 'PORT=$PORT npm start';
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check docker-compose.yml
  const dockerComposePath = path.join(localRepoPath, 'docker-compose.yml');
  const dockerComposeYamlPath = path.join(localRepoPath, 'docker-compose.yaml');
  if (fs.existsSync(dockerComposePath) || fs.existsSync(dockerComposeYamlPath)) {
    if (!runScript) {
      runScript = 'docker compose up';
    }
  }

  // Check Python requirements.txt
  const requirementsPath = path.join(localRepoPath, 'requirements.txt');
  if (fs.existsSync(requirementsPath)) {
    setupParts.push('pip install -r requirements.txt');
  }

  // Check Go go.mod
  const goModPath = path.join(localRepoPath, 'go.mod');
  if (fs.existsSync(goModPath)) {
    setupParts.push('go mod download');
    if (!runScript) {
      runScript = 'PORT=$PORT go run .';
    }
  }

  // Check Makefile for dev/start targets
  const makefilePath = path.join(localRepoPath, 'Makefile');
  if (fs.existsSync(makefilePath)) {
    try {
      const makefile = fs.readFileSync(makefilePath, 'utf-8');
      const targets = makefile.match(/^([a-zA-Z_-]+)\s*:/gm)?.map((t) => t.replace(':', '').trim()) ?? [];
      if (!runScript) {
        if (targets.includes('dev')) {
          runScript = 'make dev';
        } else if (targets.includes('start')) {
          runScript = 'make start';
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  return {
    setupScript: setupParts.length > 0 ? setupParts.join('\n') : null,
    runScript,
  };
};
