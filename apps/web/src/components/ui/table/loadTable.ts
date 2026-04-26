let initialized: Promise<void> | null = null;

export function ensureAgGridSetup() {
  if (!initialized) {
    initialized = (async () => {
      if (typeof window === "undefined") return;

      const community = await import("ag-grid-community");
      const { ModuleRegistry, ClientSideRowModelModule } = community;

      const enterprise = await import("ag-grid-enterprise");
      const { AllEnterpriseModule, LicenseManager } = enterprise;

      ModuleRegistry.registerModules([ClientSideRowModelModule, AllEnterpriseModule]);

      if (import.meta.env.VITE_AG_GRID_LICENSE_KEY) {
        LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY);
      }
    })();
  }
  return initialized;
}
