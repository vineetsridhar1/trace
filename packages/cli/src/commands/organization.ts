import { usage } from "../errors.js";

export function requireOrganizationId(value: string | undefined): string {
  return value || usage("The Trace organization is unavailable in this session");
}
