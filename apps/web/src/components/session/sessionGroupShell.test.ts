import { describe, expect, it } from "vitest";
import { sessionGroupShellCapabilities } from "./sessionGroupShell";

describe("sessionGroupShellCapabilities", () => {
  it("keeps design sessions on the canvas/chat shell without coding chrome commands", () => {
    const capabilities = sessionGroupShellCapabilities({
      kind: "design",
      selectedSessionHosting: "cloud",
      selectedSessionIsOptimistic: false,
      bridgeInteractionAllowed: true,
      terminalAllowed: true,
    });

    expect(capabilities).toMatchObject({
      isDesignMode: true,
      canUseCodingChrome: false,
      showHeaderSidebar: false,
      showHeaderApplications: false,
      showTabStrip: false,
      registerTabAndFileCommands: false,
      registerSidebarCommands: false,
      registerApplicationsCommand: false,
      registerNewChatCommand: false,
      registerTerminalCommand: false,
    });
  });

  it("keeps cloud app sessions eligible for application and terminal surfaces", () => {
    const capabilities = sessionGroupShellCapabilities({
      kind: "app",
      selectedSessionHosting: "cloud",
      selectedSessionIsOptimistic: false,
      bridgeInteractionAllowed: true,
      terminalAllowed: true,
    });

    expect(capabilities).toMatchObject({
      isDesignMode: false,
      canUseCodingChrome: true,
      showHeaderSidebar: true,
      showHeaderApplications: true,
      showTabStrip: true,
      registerTabAndFileCommands: true,
      registerSidebarCommands: true,
      registerApplicationsCommand: true,
      registerNewChatCommand: true,
      registerTerminalCommand: true,
    });
  });

  it("preserves coding shell behavior while respecting optimistic and runtime guards", () => {
    const capabilities = sessionGroupShellCapabilities({
      kind: "coding",
      selectedSessionHosting: "local",
      selectedSessionIsOptimistic: true,
      bridgeInteractionAllowed: true,
      terminalAllowed: true,
    });

    expect(capabilities).toMatchObject({
      isDesignMode: false,
      canUseCodingChrome: true,
      showHeaderSidebar: true,
      showHeaderApplications: false,
      showTabStrip: true,
      registerTabAndFileCommands: true,
      registerSidebarCommands: false,
      registerApplicationsCommand: false,
      registerNewChatCommand: false,
      registerTerminalCommand: false,
    });
  });
});
