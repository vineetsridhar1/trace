#!/usr/bin/env node

type HttpMethod = "GET" | "POST";

type TraceEnv = {
  apiUrl: string;
  orgId: string;
  assistantSessionId: string;
  actorId: string;
  token: string;
};

function readEnv(): TraceEnv {
  const apiUrl = process.env.TRACE_API_URL;
  const orgId = process.env.TRACE_ORG_ID;
  const assistantSessionId = process.env.TRACE_ASSISTANT_SESSION_ID;
  const actorId = process.env.TRACE_ACTOR_ID;
  const token = process.env.TRACE_CAPABILITY_TOKEN;

  const missing = [
    !apiUrl && "TRACE_API_URL",
    !orgId && "TRACE_ORG_ID",
    !assistantSessionId && "TRACE_ASSISTANT_SESSION_ID",
    !actorId && "TRACE_ACTOR_ID",
    !token && "TRACE_CAPABILITY_TOKEN",
  ].filter((item): item is string => typeof item === "string");

  if (missing.length > 0) {
    throw new Error(`Missing Trace CLI env: ${missing.join(", ")}`);
  }

  return {
    apiUrl: apiUrl!,
    orgId: orgId!,
    assistantSessionId: assistantSessionId!,
    actorId: actorId!,
    token: token!,
  };
}

function usage(): string {
  return [
    "Usage:",
    "  trace org recent --limit 50",
    '  trace org search "query"',
    "  trace session context <sessionId>",
    "  trace ticket get <ticketId>",
    '  trace suggest send-message --session <id> --body "..."',
    '  trace suggest create-session --title "..." --prompt "..."',
  ].join("\n");
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function isHelp(args: string[]): boolean {
  return args.length === 0 || args.includes("--help") || args.includes("-h") || args[0] === "help";
}

async function request(env: TraceEnv, method: HttpMethod, path: string, body?: unknown) {
  const response = await fetch(new URL(path, env.apiUrl), {
    method,
    headers: {
      authorization: `Bearer ${env.token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const data = text
    ? (() => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return text;
        }
      })()
    : null;
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : response.statusText;
    throw new Error(message);
  }
  return data;
}

async function main(argv: string[]) {
  if (isHelp(argv)) return usage();

  const env = readEnv();
  const [area, command, ...rest] = argv;

  if (area === "org" && command === "recent") {
    const limit = readFlag(rest, "--limit") ?? "50";
    return request(env, "GET", `/agent-tools/org/recent?limit=${encodeURIComponent(limit)}`);
  }

  if (area === "org" && command === "search") {
    const query = rest.find((arg) => !arg.startsWith("--"));
    if (!query) throw new Error("trace org search requires a query");
    return request(env, "GET", `/agent-tools/org/search?q=${encodeURIComponent(query)}`);
  }

  if (area === "session" && command === "context") {
    const sessionId = rest[0];
    if (!sessionId) throw new Error("trace session context requires a session id");
    return request(env, "GET", `/agent-tools/session/${encodeURIComponent(sessionId)}/context`);
  }

  if (area === "ticket" && command === "get") {
    const ticketId = rest[0];
    if (!ticketId) throw new Error("trace ticket get requires a ticket id");
    return request(env, "GET", `/agent-tools/ticket/${encodeURIComponent(ticketId)}`);
  }

  if (area === "suggest" && command === "send-message") {
    const sessionId = readFlag(rest, "--session");
    const body = readFlag(rest, "--body");
    const rationale = readFlag(rest, "--rationale");
    if (!sessionId || !body) {
      throw new Error("trace suggest send-message requires --session and --body");
    }
    return request(env, "POST", "/agent-tools/suggest/send-message", {
      sessionId,
      body,
      rationale,
    });
  }

  if (area === "suggest" && command === "create-session") {
    const title = readFlag(rest, "--title");
    const prompt = readFlag(rest, "--prompt");
    const rationale = readFlag(rest, "--rationale");
    if (!prompt) throw new Error("trace suggest create-session requires --prompt");
    return request(env, "POST", "/agent-tools/suggest/create-session", {
      title,
      prompt,
      rationale,
    });
  }

  throw new Error(usage());
}

main(process.argv.slice(2))
  .then((data) => {
    if (typeof data === "string") {
      process.stdout.write(`${data}\n`);
      return;
    }
    if (data !== undefined) {
      process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    }
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${usage()}\n`);
    process.exitCode = 1;
  });
