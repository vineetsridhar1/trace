const { expo } = require("./app.json");

module.exports = ({ config }) => {
  const configuredProjectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    config.extra?.eas?.projectId ||
    expo.extra?.eas?.projectId;

  return {
    ...expo,
    extra: {
      ...expo.extra,
      eas: {
        ...expo.extra?.eas,
        projectId: configuredProjectId,
      },
    },
  };
};
