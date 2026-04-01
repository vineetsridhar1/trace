// Re-export JSON types from the canonical source in @trace/shared.
// This file exists so codegen-generated relative imports (e.g. ../json#JsonValue)
// continue to resolve correctly.
export type { JsonPrimitive, JsonValue, JsonObject, JsonArray } from "@trace/shared";
