export type DesignViewport = { width: number; height: number };
export type DesignPosition = { x: number; y: number };

export type DesignScreen = {
  id: string;
  name: string;
  component: string;
  variation?: string;
  state?: string;
  viewport: DesignViewport;
  position?: DesignPosition;
};

export type DesignSection = {
  id: string;
  name: string;
  screenIds: string[];
};

export type DesignManifest = {
  version: 1;
  sections: DesignSection[];
  screens: DesignScreen[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a string`);
  return value;
}

function positiveNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive number`);
  }
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
}

export function validateDesignManifest(value: unknown): DesignManifest {
  const source = record(value);
  if (!source || source.version !== 1) throw new Error("design.canvas.json version must be 1");
  if (!Array.isArray(source.sections) || !Array.isArray(source.screens)) {
    throw new Error("design.canvas.json must define sections and screens arrays");
  }

  const screenIds = new Set<string>();
  const screens = source.screens.map((entry, index): DesignScreen => {
    const screen = record(entry);
    if (!screen) throw new Error(`screens[${index}] must be an object`);
    const id = nonEmptyString(screen.id, `screens[${index}].id`);
    if (screenIds.has(id)) throw new Error(`Duplicate screen id: ${id}`);
    screenIds.add(id);
    const component = nonEmptyString(screen.component, `screens[${index}].component`);
    if (!/^\.\/screens\/[A-Za-z0-9._-]+\.tsx$/.test(component)) {
      throw new Error(`screens[${index}].component must reference ./screens/*.tsx`);
    }
    const viewport = record(screen.viewport);
    if (!viewport) throw new Error(`screens[${index}].viewport must be an object`);
    const position = screen.position === undefined ? null : record(screen.position);
    if (screen.position !== undefined && !position) {
      throw new Error(`screens[${index}].position must be an object`);
    }
    return {
      id,
      name: nonEmptyString(screen.name, `screens[${index}].name`),
      component,
      variation:
        screen.variation === undefined
          ? undefined
          : nonEmptyString(screen.variation, `screens[${index}].variation`),
      state:
        screen.state === undefined
          ? undefined
          : nonEmptyString(screen.state, `screens[${index}].state`),
      viewport: {
        width: positiveNumber(viewport.width, `screens[${index}].viewport.width`),
        height: positiveNumber(viewport.height, `screens[${index}].viewport.height`),
      },
      position: position
        ? {
            x: finiteNumber(position.x ?? 0, `screens[${index}].position.x`),
            y: finiteNumber(position.y ?? 0, `screens[${index}].position.y`),
          }
        : undefined,
    };
  });

  const sectionIds = new Set<string>();
  const assignedScreenIds = new Set<string>();
  const sections = source.sections.map((entry, index): DesignSection => {
    const section = record(entry);
    if (!section) throw new Error(`sections[${index}] must be an object`);
    const id = nonEmptyString(section.id, `sections[${index}].id`);
    if (sectionIds.has(id)) throw new Error(`Duplicate section id: ${id}`);
    sectionIds.add(id);
    if (!Array.isArray(section.screenIds)) {
      throw new Error(`sections[${index}].screenIds must be an array`);
    }
    const ids = section.screenIds.map((screenId, screenIndex) => {
      const value = nonEmptyString(screenId, `sections[${index}].screenIds[${screenIndex}]`);
      if (!screenIds.has(value)) throw new Error(`Unknown screen id in section ${id}: ${value}`);
      if (assignedScreenIds.has(value))
        throw new Error(`Screen appears in multiple sections: ${value}`);
      assignedScreenIds.add(value);
      return value;
    });
    return { id, name: nonEmptyString(section.name, `sections[${index}].name`), screenIds: ids };
  });

  for (const id of screenIds) {
    if (!assignedScreenIds.has(id)) throw new Error(`Screen is not assigned to a section: ${id}`);
  }
  return { version: 1, sections, screens };
}
