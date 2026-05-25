import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const signingIdentity = process.env.TRACE_MACOS_SIGN_IDENTITY;
const skipSigning = process.env.TRACE_MACOS_SKIP_SIGN === "1";
const updateRepo = process.env.TRACE_DESKTOP_UPDATE_REPO;

function parseRepoSlug(slug) {
  if (!slug) return null;
  const [owner, name] = slug.split("/");
  if (!owner || !name) {
    throw new Error(
      `TRACE_DESKTOP_UPDATE_REPO must be in "owner/name" form, got "${slug}"`,
    );
  }
  return { owner, name };
}

const repository = parseRepoSlug(updateRepo);

function notarizeConfigFromEnv() {
  if (process.env.TRACE_MACOS_NOTARY_KEYCHAIN_PROFILE) {
    return { keychainProfile: process.env.TRACE_MACOS_NOTARY_KEYCHAIN_PROFILE };
  }

  if (
    process.env.APPLE_API_KEY &&
    process.env.APPLE_API_KEY_ID &&
    process.env.APPLE_API_ISSUER
  ) {
    return {
      appleApiKey: process.env.APPLE_API_KEY,
      appleApiKeyId: process.env.APPLE_API_KEY_ID,
      appleApiIssuer: process.env.APPLE_API_ISSUER,
    };
  }

  const appleIdPassword =
    process.env.APPLE_APP_SPECIFIC_PASSWORD ?? process.env.APPLE_ID_PASSWORD;

  if (process.env.APPLE_ID && appleIdPassword && process.env.APPLE_TEAM_ID) {
    return {
      appleId: process.env.APPLE_ID,
      appleIdPassword,
      teamId: process.env.APPLE_TEAM_ID,
    };
  }

  return null;
}

const packagerConfig = {
  appBundleId: "org.gettrace.desktop",
  asar: true,
  icon: path.join(configDir, "assets", "icon"),
};

if (!skipSigning) {
  packagerConfig.osxSign = {
    continueOnError: false,
    ...(signingIdentity ? { identity: signingIdentity } : {}),
  };

  const osxNotarize = notarizeConfigFromEnv();
  if (osxNotarize) {
    packagerConfig.osxNotarize = osxNotarize;
  }
}

export default {
  packagerConfig,
  makers: [
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
  ],
  publishers: repository
    ? [
        {
          name: "@electron-forge/publisher-github",
          config: {
            repository,
            draft: false,
            prerelease: false,
          },
        },
      ]
    : [],
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
  ],
};
