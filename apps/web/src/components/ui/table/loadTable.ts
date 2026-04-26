let initialized: Promise<void> | null = null;

export function ensureAgGridSetup() {
  if (!initialized) {
    initialized = (async () => {
      if (typeof window === "undefined") return;

      const community = await import("ag-grid-community");
      const { ModuleRegistry, ClientSideRowModelModule } = community;

      ModuleRegistry.registerModules([ClientSideRowModelModule]);
    })();
  }
  return initialized;
}
