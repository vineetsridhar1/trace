import { describe, expect, it } from "vitest";
import {
  appCodingSessionTarget,
  parseAppTokenPatchInput,
  parseTrustedAppOverlayMessage,
  publishedAppShareUrl,
} from "./SessionApplicationsPanel";
import { defaultAppTokenPatchJson } from "./AppTokenTweaksPopover";

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

  it("keeps the app token tweak default as valid JSON", () => {
    expect(parseAppTokenPatchInput(defaultAppTokenPatchJson())).toEqual({
      color: { primary: "#ef4444" },
    });
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

describe("publishedAppShareUrl", () => {
  it("returns only public endpoint URLs for publish/share", () => {
    expect(publishedAppShareUrl({ accessMode: "public", url: "https://app.trace.test" })).toBe(
      "https://app.trace.test",
    );
    expect(
      publishedAppShareUrl({ accessMode: "private", url: "https://app.trace.test" }),
    ).toBeNull();
    expect(publishedAppShareUrl(null)).toBeNull();
  });
});

describe("appCodingSessionTarget", () => {
  it("returns navigation ids for app-to-coding handoff sessions", () => {
    expect(appCodingSessionTarget({ id: "session-1", sessionGroupId: "group-1" })).toEqual({
      sessionId: "session-1",
      sessionGroupId: "group-1",
    });
    expect(appCodingSessionTarget(null)).toBeNull();
  });
});
