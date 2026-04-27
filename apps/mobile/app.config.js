module.exports = ({ config }) => {
  const configuredProjectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    config.extra?.eas?.projectId;

  return {
    ...config,
    extra: {
      ...config.extra,
      eas: {
        ...config.extra?.eas,
        projectId: configuredProjectId,
      },
    },
  };
};
