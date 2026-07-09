export type SessionGroupShellKind = "coding" | "design" | "app" | string | null | undefined;

export function sessionGroupShellCapabilities(input: {
  kind: SessionGroupShellKind;
  selectedSessionHosting?: string | null;
  selectedSessionIsOptimistic?: boolean;
  bridgeInteractionAllowed?: boolean;
  terminalAllowed?: boolean;
}) {
  const isDesignMode = input.kind === "design";
  const canUseCodingChrome = !isDesignMode;
  const selectedSessionIsOptimistic = input.selectedSessionIsOptimistic === true;
  const showApplicationsSidebarTab =
    canUseCodingChrome && input.selectedSessionHosting === "cloud";
  const canInteract = !selectedSessionIsOptimistic;
  const bridgeInteractionAllowed = input.bridgeInteractionAllowed === true;
  const terminalAllowed = input.terminalAllowed === true;

  return {
    isDesignMode,
    canUseCodingChrome,
    showHeaderSidebar: canUseCodingChrome,
    showHeaderApplications: showApplicationsSidebarTab,
    showTabStrip: canUseCodingChrome,
    registerTabAndFileCommands: canUseCodingChrome,
    registerSidebarCommands: canUseCodingChrome && canInteract,
    registerApplicationsCommand: showApplicationsSidebarTab && canInteract,
    registerNewChatCommand:
      canUseCodingChrome && canInteract && bridgeInteractionAllowed,
    registerTerminalCommand:
      canUseCodingChrome && canInteract && terminalAllowed,
  };
}
