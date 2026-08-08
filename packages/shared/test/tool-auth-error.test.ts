import { describe, expect, it } from "vitest";
import { isToolAuthError } from "../src/adapters/coding-tool.js";

describe("isToolAuthError", () => {
  it.each([
    "Failed to authenticate: OAuth session expired and could not be refreshed",
    "OAuth token is revoked",
    "Expired OAuth session",
    "Not logged in. Please run /login",
    "Error: Not logged in",
  ])("recognizes a credential failure: %s", (message) => {
    expect(isToolAuthError(message)).toBe(true);
  });

  it.each([
    "The request timed out",
    "Permission denied while reading the repository",
    "Rate limit exceeded",
    "Session not found",
    "Invalid API key",
    "API Error: 401 authentication_error",
    "Failed to authenticate GitHub remote",
    "The GitHub CLI is not logged in",
  ])("leaves an unrelated failure alone: %s", (message) => {
    expect(isToolAuthError(message)).toBe(false);
  });
});
