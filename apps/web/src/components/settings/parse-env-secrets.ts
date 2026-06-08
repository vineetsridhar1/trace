export type ParsedEnvSecret = {
  name: string;
  value: string;
  line: number;
};

export type ParsedEnvSecrets = {
  entries: ParsedEnvSecret[];
  invalidLines: number[];
};

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseEnvSecrets(source: string): ParsedEnvSecrets {
  const entriesByName = new Map<string, ParsedEnvSecret>();
  const invalidLines: number[] = [];
  const lines = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const trimmedLine = rawLine.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) return;

    const parsed = parseEnvLine(rawLine, lineNumber);
    if (!parsed) {
      invalidLines.push(lineNumber);
      return;
    }
    entriesByName.set(parsed.name, parsed);
  });

  return {
    entries: Array.from(entriesByName.values()),
    invalidLines,
  };
}

function parseEnvLine(rawLine: string, line: number): ParsedEnvSecret | null {
  const withoutExport = rawLine.trimStart().replace(/^export\s+/, "");
  const equalsIndex = withoutExport.indexOf("=");
  if (equalsIndex <= 0) return null;

  const name = withoutExport.slice(0, equalsIndex).trim();
  if (!ENV_KEY_PATTERN.test(name)) return null;

  const value = parseEnvValue(withoutExport.slice(equalsIndex + 1));
  if (!value) return null;

  return {
    name,
    value,
    line,
  };
}

function parseEnvValue(rawValue: string): string {
  const value = rawValue.trimStart();
  if (!value) return "";

  if (value.startsWith('"')) {
    return parseQuotedValue(value, '"');
  }
  if (value.startsWith("'")) {
    return parseQuotedValue(value, "'");
  }

  return stripInlineComment(value).trimEnd();
}

function parseQuotedValue(value: string, quote: '"' | "'"): string {
  let result = "";
  let escaped = false;

  for (let index = 1; index < value.length; index += 1) {
    const char = value[index];
    if (quote === "'" && char === "\\" && value[index + 1] !== "'") {
      result += char;
      continue;
    }
    if (escaped) {
      result += quote === '"' ? unescapeDoubleQuotedChar(char) : char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === quote) return result;
    result += char;
  }

  if (escaped) result += "\\";
  return result;
}

function unescapeDoubleQuotedChar(char: string): string {
  if (char === "n") return "\n";
  if (char === "r") return "\r";
  if (char === "t") return "\t";
  return char;
}

function stripInlineComment(value: string): string {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "#" && /\s/.test(value[index - 1] ?? "")) {
      return value.slice(0, index);
    }
  }
  return value;
}
