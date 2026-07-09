import { describe, expect, it } from "vitest";
import {
  parseAppTokenPatchInput,
  parseTrustedAppOverlayMessage,
} from "./SessionApplicationsPanel";

describe("parseAppTokenPatchInput", () => {
  it("accepts JSON object token patches", () => {
    expect(parseAppTokenPatchInput('{"color":{"primary":"#ef4444"}}')).toEqual({
      color: { primary: "#ef4444" },
    });
  });

  it("rejects non-object token patches", () => {
    expect(() => parseAppTokenPatchInput("[]")).toThrow("Token patch must be a JSON object.");
    expect(() => parseAppTokenPatchInput('"bad"')).toThrow("Token patch must be a JSON object.");
  });
});

describe("parseTrustedAppOverlayMessage", () => {
  const previewUrl = "https://endpointkey.preview.trace.test/__trace_preview_auth?token=secret";

  it("accepts source selections from the current preview origin", () => {
    expect(
      parseTrustedAppOverlayMessage(
        {
          type: "trace:app:overlay",
          source: "endpoint-proxy",
          event: "element-selected",
          sourceLocation: "app/page.tsx:34",
          text: "Start building",
        },
        "https://endpointkey.preview.trace.test",
        previewUrl,
      ),
    ).toEqual({
      kind: "element",
      sourceLocation: "app/page.tsx:34",
      text: "Start building",
    });
  });

  it("accepts script errors from the current preview origin", () => {
    expect(
      parseTrustedAppOverlayMessage(
        {
          type: "trace:app:overlay",
          source: "endpoint-proxy",
          event: "error",
          message: "Boom",
          stack: "Error: Boom",
        },
        "https://endpointkey.preview.trace.test",
        previewUrl,
      ),
    ).toEqual({
      kind: "error",
      message: "Boom",
      stack: "Error: Boom",
    });
  });

  it("rejects messages from other origins or non-overlay payloads", () => {
    expect(
      parseTrustedAppOverlayMessage(
        {
          type: "trace:app:overlay",
          source: "endpoint-proxy",
          event: "element-selected",
          sourceLocation: "app/page.tsx:34",
        },
        "https://attacker.test",
        previewUrl,
      ),
    ).toBeNull();
    expect(
      parseTrustedAppOverlayMessage(
        { type: "trace:artifact:element-selected", sourceLocation: "app/page.tsx:34" },
        "https://endpointkey.preview.trace.test",
        previewUrl,
      ),
    ).toBeNull();
  });
});
