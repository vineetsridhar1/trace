import { describe, expect, it, vi } from "vitest";
import {
  checkForAppUpdate,
  isTrustedReleaseUrl,
  parseLatestRelease,
  selectReleaseDownload,
} from "./app-update.js";

const release = {
  tag_name: "v0.0.6",
  html_url: "https://github.com/opendoor-labs/trace/releases/tag/v0.0.6",
  assets: [
    {
      name: "Trace-0.0.6-arm64.dmg",
      browser_download_url:
        "https://github.com/opendoor-labs/trace/releases/download/v0.0.6/Trace-0.0.6-arm64.dmg",
    },
    {
      name: "Trace-0.0.6-x64.dmg",
      browser_download_url:
        "https://github.com/opendoor-labs/trace/releases/download/v0.0.6/Trace-0.0.6-x64.dmg",
    },
  ],
};

describe("app update checks", () => {
  it("selects the installer for the current architecture", () => {
    const parsed = parseLatestRelease(release);
    expect(parsed).not.toBeNull();
    expect(selectReleaseDownload(parsed!, "darwin", "arm64")).toContain("arm64.dmg");
    expect(selectReleaseDownload(parsed!, "darwin", "x64")).toContain("x64.dmg");
  });

  it("reports a newer stable release and queries the fixed repository", async () => {
    const runGh = vi.fn(async () => JSON.stringify(release));
    const result = await checkForAppUpdate({
      currentVersion: "0.0.5",
      platform: "darwin",
      arch: "arm64",
      ghPath: "/usr/local/bin/gh",
      runGh,
    });

    expect(runGh).toHaveBeenCalledWith("/usr/local/bin/gh", [
      "api",
      "repos/opendoor-labs/trace/releases/latest",
    ]);
    expect(result).toEqual({
      status: {
        state: "update_available",
        currentVersion: "0.0.5",
        latestVersion: "0.0.6",
        directDownload: true,
      },
      openUrl:
        "https://github.com/opendoor-labs/trace/releases/download/v0.0.6/Trace-0.0.6-arm64.dmg",
    });
  });

  it("does not offer a release that is not newer", async () => {
    const result = await checkForAppUpdate({
      currentVersion: "0.0.6",
      platform: "darwin",
      arch: "arm64",
      ghPath: "/usr/local/bin/gh",
      runGh: async () => JSON.stringify(release),
    });

    expect(result.status.state).toBe("up_to_date");
    expect(result.openUrl).toBeNull();
  });

  it("falls back to the release page when there is no compatible asset", async () => {
    const result = await checkForAppUpdate({
      currentVersion: "0.0.5",
      platform: "linux",
      arch: "x64",
      ghPath: "/usr/local/bin/gh",
      runGh: async () => JSON.stringify(release),
    });

    expect(result.status.directDownload).toBe(false);
    expect(result.openUrl).toBe(release.html_url);
  });

  it("fails closed for untrusted URLs and unavailable gh", async () => {
    expect(isTrustedReleaseUrl("https://example.com/opendoor-labs/trace/releases/latest")).toBe(
      false,
    );
    expect(parseLatestRelease({ ...release, html_url: "https://example.com/release" })).toBeNull();

    const result = await checkForAppUpdate({
      currentVersion: "0.0.5",
      platform: "darwin",
      arch: "arm64",
      ghPath: null,
    });
    expect(result.status.state).toBe("unavailable");
    expect(result.openUrl).toBeNull();
  });
});
