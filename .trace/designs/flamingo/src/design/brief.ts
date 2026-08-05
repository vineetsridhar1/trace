export type DesignReference = {
  source: string;
  preserve: string[];
  reinterpret: string[];
  avoidCopying: string[];
  evidence: string[];
};

export type DesignBrief = {
  version: 1;
  artifactType: string | null;
  audience: string | null;
  platform: string | null;
  fidelity: string | null;
  primaryJob: string | null;
  coreFlow: string[];
  requiredStates: string[];
  direction: { name: string | null; principles: string[] };
  references: DesignReference[];
  assumptions: string[];
};

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nullableText(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be text or null`);
  return value.trim();
}

function textList(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value.map((entry, index) => {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new Error(`${path}[${index}] must be a string`);
    }
    return entry.trim();
  });
}

export function validateDesignBrief(value: unknown): DesignBrief {
  const source = record(value, "design.brief.json");
  if (source.version !== 1) throw new Error("design.brief.json version must be 1");
  const directionSource = record(source.direction, "direction");
  if (!Array.isArray(source.references)) throw new Error("references must be an array");

  const references = source.references.map((entry, index): DesignReference => {
    const reference = record(entry, `references[${index}]`);
    const sourceName = nullableText(reference.source, `references[${index}].source`);
    if (sourceName === null) throw new Error(`references[${index}].source must be text`);
    return {
      source: sourceName,
      preserve: textList(reference.preserve, `references[${index}].preserve`),
      reinterpret: textList(reference.reinterpret, `references[${index}].reinterpret`),
      avoidCopying: textList(reference.avoidCopying, `references[${index}].avoidCopying`),
      evidence: textList(reference.evidence, `references[${index}].evidence`),
    };
  });

  return {
    version: 1,
    artifactType: nullableText(source.artifactType, "artifactType"),
    audience: nullableText(source.audience, "audience"),
    platform: nullableText(source.platform, "platform"),
    fidelity: nullableText(source.fidelity, "fidelity"),
    primaryJob: nullableText(source.primaryJob, "primaryJob"),
    coreFlow: textList(source.coreFlow, "coreFlow"),
    requiredStates: textList(source.requiredStates, "requiredStates"),
    direction: {
      name: nullableText(directionSource.name, "direction.name"),
      principles: textList(directionSource.principles, "direction.principles"),
    },
    references,
    assumptions: textList(source.assumptions, "assumptions"),
  };
}
