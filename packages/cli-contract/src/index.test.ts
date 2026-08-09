import { parse } from "graphql";
import { describe, expect, it } from "vitest";
import { traceCliOperations } from "./index.js";

describe("Trace CLI operation contract", () => {
  it("contains unique, named, single-root GraphQL operations", () => {
    const names = new Set<string>();
    for (const definition of Object.values(traceCliOperations)) {
      expect(names.has(definition.name)).toBe(false);
      names.add(definition.name);

      const document = parse(definition.document);
      expect(document.definitions).toHaveLength(1);
      const operation = document.definitions[0];
      expect(operation?.kind).toBe("OperationDefinition");
      if (operation?.kind !== "OperationDefinition") continue;
      expect(operation.name?.value).toBe(definition.name);
      expect(operation.operation).toBe(definition.type);
      expect(operation.selectionSet.selections).toHaveLength(1);
      const root = operation.selectionSet.selections[0];
      expect(root?.kind).toBe("Field");
      if (root?.kind === "Field") expect(root.name.value).toBe(definition.rootField);
    }
  });
});
