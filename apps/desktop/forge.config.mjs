const signingIdentity = process.env.TRACE_MACOS_SIGN_IDENTITY;
const skipSigning = process.env.TRACE_MACOS_SKIP_SIGN === "1";

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
  icon: "assets/icon",
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
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "vineetsridhar1",
          name: "trace",
        },
        draft: false,
        prerelease: false,
      },
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
  ],
};
