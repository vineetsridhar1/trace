import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TAIL_BYTES = 32_768; // 32 KB — enough for the last few JSONL entries

/**
 * Find the transcript JSONL file for a given Claude session ID.
 * Claude Code stores transcripts at ~/.claude/projects/<project-hash>/<session_id>.jsonl
 */
export function resolveTranscriptPath(sessionId: string): string | undefined {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  try {
    const projects = fs.readdirSync(projectsDir);
    for (const project of projects) {
      const candidate = path.join(projectsDir, project, `${sessionId}.jsonl`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  } catch {
    // ~/.claude/projects may not exist
  }
  return undefined;
}

export function extractUsageFromTranscript(
  transcriptPath: string,
): { input_tokens: number; output_tokens: number } | null {
  try {
    const fd = fs.openSync(transcriptPath, 'r');
    try {
      const stat = fs.fstatSync(fd);
      const readFrom = Math.max(0, stat.size - TAIL_BYTES);
      const buf = Buffer.alloc(Math.min(stat.size, TAIL_BYTES));
      fs.readSync(fd, buf, 0, buf.length, readFrom);
      const tail = buf.toString('utf-8');

      const lines = tail.split('\n');
      if (readFrom > 0) lines.shift();

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }

        const entry = parsed as Record<string, unknown>;
        if (entry.type !== 'assistant') continue;

        const message = entry.message as Record<string, unknown> | undefined;
        const usage = message?.usage as { input_tokens?: number; output_tokens?: number } | undefined;
        if (usage?.input_tokens) {
          return {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens ?? 0,
          };
        }

        return null;
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Transcript file may not exist or be unreadable
  }

  return null;
}

export function extractAskUserQuestionFromTranscript(
  transcriptPath: string,
): { questions: unknown[] } | null {
  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      const entry = parsed as Record<string, unknown>;

      // If we hit a user message before finding an assistant message, the user
      // already responded to any prior AskUserQuestion — no pending input.
      if (entry.type === 'user') return null;

      if (entry.type !== 'assistant') continue;

      const message = entry.message as Record<string, unknown> | undefined;
      if (!message?.content || !Array.isArray(message.content)) {
        return null;
      }

      for (const block of message.content) {
        const b = block as Record<string, unknown>;
        if (b.type === 'tool_use' && b.name === 'AskUserQuestion') {
          const input = b.input as Record<string, unknown> | undefined;
          if (input?.questions && Array.isArray(input.questions) && input.questions.length > 0) {
            return { questions: input.questions };
          }
        }
      }

      return null;
    }
  } catch {
    // Transcript file may not exist or be unreadable
  }

  return null;
}

export function extractExitPlanModeFromTranscript(
  transcriptPath: string,
): { input: unknown } | null {
  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      const entry = parsed as Record<string, unknown>;

      // If we hit a user message before finding an assistant message, the user
      // already responded to any prior ExitPlanMode — no pending input.
      if (entry.type === 'user') return null;

      if (entry.type !== 'assistant') continue;

      const message = entry.message as Record<string, unknown> | undefined;
      if (!message?.content || !Array.isArray(message.content)) {
        return null;
      }

      for (const block of message.content) {
        const b = block as Record<string, unknown>;
        if (b.type === 'tool_use' && b.name === 'ExitPlanMode') {
          return { input: b.input };
        }
      }

      return null;
    }
  } catch {
    // Transcript file may not exist or be unreadable
  }

  return null;
}
