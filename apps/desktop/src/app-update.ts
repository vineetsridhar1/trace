import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildChildProcessEnv, resolveExecutable } from "@trace/shared/adapters";
import { compareVersions, extractVersion } from "./version.js";

const execFileAsync = promisify(execFile);
const RELEASE_REPO = "opendoor-labs/trace";
const RELEASE_PATH_PREFIX = `/${RELEASE_REPO}/releases/`;
const COMMAND_TIMEOUT_MS = 10_000;

export type AppUpdateStatus = {
  state: "up_to_date" | "update_available" | "unavailable";
  currentVersion: string;
  latestVersion: string | null;
  directDownload: boolean;
};

export type AppUpdateCheck = {
  status: AppUpdateStatus;
  openUrl: string | null;
};

type ReleaseAsset = {
  name: string;
  browserDownloadUrl: string;
};

type LatestRelease = {
  tagName: string;
  htmlUrl: string;
  assets: ReleaseAsset[];
};

type CheckAppUpdateInput = {
  currentVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  ghPath?: string | null;
  runGh?: (executable: string, args: string[]) => Promise<string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTrustedReleaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.pathname.startsWith(RELEASE_PATH_PREFIX)
    );
  } catch {
    return false;
  }
}

export function parseLatestRelease(value: unknown): LatestRelease | null {
  if (!isRecord(value)) return null;
  const tagName = value.tag_name;
  const htmlUrl = value.html_url;
  if (typeof tagName !== "string" || typeof htmlUrl !== "string" || !isTrustedReleaseUrl(htmlUrl)) {
    return null;
  }

  const assets = Array.isArray(value.assets)
    ? value.assets.flatMap((asset): ReleaseAsset[] => {
        if (!isRecord(asset)) return [];
        const name = asset.name;
        const browserDownloadUrl = asset.browser_download_url;
        if (
          typeof name !== "string" ||
          typeof browserDownloadUrl !== "string" ||
          !isTrustedReleaseUrl(browserDownloadUrl)
        ) {
          return [];
        }
        return [{ name, browserDownloadUrl }];
      })
    : [];

  return { tagName, htmlUrl, assets };
}

const ARCH_MARKERS = ["arm64", "aarch64", "x64", "x86_64", "amd64"];

function assetSupportsPlatform(name: string, platform: NodeJS.Platform): boolean {
  const normalized = name.toLowerCase();
  if (platform === "darwin") return normalized.endsWith(".dmg");
  if (platform === "win32") return normalized.endsWith(".exe") || normalized.endsWith(".msi");
  if (platform === "linux") {
    return normalized.endsWith(".appimage") || normalized.endsWith(".deb");
  }
  return false;
}

function assetSupportsArch(name: string, arch: string): boolean {
  const normalized = name.toLowerCase();
  if (arch === "arm64") return normalized.includes("arm64") || normalized.includes("aarch64");
  if (arch === "x64") {
    return (
      normalized.includes("x64") || normalized.includes("x86_64") || normalized.includes("amd64")
    );
  }
  return normalized.includes(arch.toLowerCase());
}

export function selectReleaseDownload(
  release: LatestRelease,
  platform: NodeJS.Platform,
  arch: string,
): string | null {
  const platformAssets = release.assets.filter((asset) =>
    assetSupportsPlatform(asset.name, platform),
  );
  const architectureMatch = platformAssets.find((asset) => assetSupportsArch(asset.name, arch));
  if (architectureMatch) return architectureMatch.browserDownloadUrl;

  const genericMatch = platformAssets.find((asset) => {
    const normalized = asset.name.toLowerCase();
    return !ARCH_MARKERS.some((marker) => normalized.includes(marker));
  });
  return genericMatch?.browserDownloadUrl ?? null;
}

async function runGh(executable: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(executable, args, {
    env: { ...buildChildProcessEnv(), GH_PROMPT_DISABLED: "1" },
    maxBuffer: 5 * 1024 * 1024,
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true,
  });
  return stdout;
}

function unavailable(currentVersion: string): AppUpdateCheck {
  return {
    status: {
      state: "unavailable",
      currentVersion,
      latestVersion: null,
      directDownload: false,
    },
    openUrl: null,
  };
}

export async function checkForAppUpdate(input: CheckAppUpdateInput): Promise<AppUpdateCheck> {
  const currentVersion = extractVersion(input.currentVersion) ?? input.currentVersion;
  const ghPath = input.ghPath === undefined ? resolveExecutable("gh") : input.ghPath;
  if (!ghPath) return unavailable(currentVersion);

  try {
    const output = await (input.runGh ?? runGh)(ghPath, [
      "api",
      `repos/${RELEASE_REPO}/releases/latest`,
    ]);
    const release = parseLatestRelease(JSON.parse(output) as unknown);
    const latestVersion = release ? extractVersion(release.tagName) : null;
    if (!release || !latestVersion) return unavailable(currentVersion);

    const comparison = compareVersions(currentVersion, latestVersion);
    if (comparison === null) return unavailable(currentVersion);
    if (comparison >= 0) {
      return {
        status: {
          state: "up_to_date",
          currentVersion,
          latestVersion,
          directDownload: false,
        },
        openUrl: null,
      };
    }

    const downloadUrl = selectReleaseDownload(release, input.platform, input.arch);
    return {
      status: {
        state: "update_available",
        currentVersion,
        latestVersion,
        directDownload: downloadUrl !== null,
      },
      openUrl: downloadUrl ?? release.htmlUrl,
    };
  } catch {
    // Release checks are best effort. Missing auth or connectivity must not block Trace.
    return unavailable(currentVersion);
  }
}
