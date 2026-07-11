/**
 * Git smart-HTTP protocol helpers: pkt-line framing, service validation, and
 * receive-pack command parsing. Pure functions — no I/O, no git spawning — so
 * they can be unit-tested and reused by the git route handlers.
 *
 * Reference: git's `Documentation/gitprotocol-http.txt` and
 * `Documentation/gitprotocol-pack.txt`.
 */

/** The two smart-HTTP services Trace hosts. */
export const GIT_SERVICES = ["git-upload-pack", "git-receive-pack"] as const;
export type GitService = (typeof GIT_SERVICES)[number];

export function isGitService(value: string | undefined | null): value is GitService {
  return value === "git-upload-pack" || value === "git-receive-pack";
}

/** git-upload-pack serves fetch/clone (read); git-receive-pack serves push (write). */
export function serviceRequiresWrite(service: GitService): boolean {
  return service === "git-receive-pack";
}

/** The git subcommand binary name for a service (drops the `git-` prefix). */
export function gitSubcommand(service: GitService): "upload-pack" | "receive-pack" {
  return service === "git-upload-pack" ? "upload-pack" : "receive-pack";
}

/** Encode a single pkt-line: 4-hex length prefix (inclusive of the 4) + payload. */
export function encodePktLine(payload: string): Buffer {
  const body = Buffer.from(payload, "utf8");
  const length = body.length + 4;
  if (length > 0xffff) throw new Error("pkt-line payload too large");
  const header = Buffer.from(length.toString(16).padStart(4, "0"), "utf8");
  return Buffer.concat([header, body]);
}

/** The pkt-line flush packet ("0000"). */
export const FLUSH_PKT = Buffer.from("0000", "utf8");

/**
 * The prefix git expects before the ref advertisement on a smart-HTTP
 * `info/refs` response: a service announcement pkt-line followed by a flush.
 * The advertisement itself comes from `git <svc> --advertise-refs`.
 */
export function serviceAdvertisementPrefix(service: GitService): Buffer {
  return Buffer.concat([encodePktLine(`# service=${service}\n`), FLUSH_PKT]);
}

export type GitRefUpdate = {
  oldSha: string;
  newSha: string;
  ref: string;
};

const ZERO_SHA = "0".repeat(40);

/** Classify a parsed command by comparing against the zero SHA. */
export function classifyRefUpdate(command: GitRefUpdate): "create" | "delete" | "update" {
  if (command.oldSha === ZERO_SHA) return "create";
  if (command.newSha === ZERO_SHA) return "delete";
  return "update";
}

/**
 * Derive the exact ref transitions visible across a completed receive-pack.
 * Reading actual state before and after avoids trusting requested commands:
 * rejected updates produce no transition and therefore no event.
 */
export function diffRefStates(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): GitRefUpdate[] {
  const updates: GitRefUpdate[] = [];
  const refs = new Set([...before.keys(), ...after.keys()]);
  for (const ref of refs) {
    const oldSha = before.get(ref);
    const newSha = after.get(ref);
    if (oldSha === newSha) continue;
    updates.push({ ref, oldSha: oldSha ?? ZERO_SHA, newSha: newSha ?? ZERO_SHA });
  }
  return updates;
}
