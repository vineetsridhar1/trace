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

export type ReceivePackCommand = {
  oldSha: string;
  newSha: string;
  ref: string;
};

const ZERO_SHA = "0".repeat(40);

/**
 * Parse the ref-update command list at the head of a git-receive-pack request
 * body. Each command is `<old-sha> <new-sha> <ref>`, the first carrying a
 * NUL-delimited capability list. Parsing stops at the first flush packet, after
 * which the packfile begins. Malformed input yields an empty list rather than
 * throwing — callers treat "no parseable commands" as "nothing to report".
 */
export function parseReceivePackCommands(body: Buffer): ReceivePackCommand[] {
  const commands: ReceivePackCommand[] = [];
  let offset = 0;
  while (offset + 4 <= body.length) {
    const lengthHex = body.toString("utf8", offset, offset + 4);
    const length = parseInt(lengthHex, 16);
    if (Number.isNaN(length)) break;
    // Flush (0000) ends the command list; delim/response-end (0001/0002) are
    // not expected here — stop defensively.
    if (length < 4) break;
    if (offset + length > body.length) break;

    let line = body.toString("utf8", offset + 4, offset + length);
    offset += length;

    // The first command carries "\0<capabilities>"; drop it.
    const nulIndex = line.indexOf("\0");
    if (nulIndex !== -1) line = line.slice(0, nulIndex);
    line = line.replace(/\n$/, "");

    const parts = line.split(" ");
    if (parts.length >= 3) {
      const [oldSha, newSha, ...refParts] = parts;
      commands.push({ oldSha, newSha, ref: refParts.join(" ") });
    }
  }
  return commands;
}

/** Classify a parsed command by comparing against the zero SHA. */
export function classifyRefUpdate(command: ReceivePackCommand): "create" | "delete" | "update" {
  if (command.oldSha === ZERO_SHA) return "create";
  if (command.newSha === ZERO_SHA) return "delete";
  return "update";
}
