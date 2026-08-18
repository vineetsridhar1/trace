import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceSidebarStore } from "./workspace-sidebar";

describe("workspace sidebar", () => {
  beforeEach(() => {
    useWorkspaceSidebarStore.setState({
      filesSessionGroupId: null,
      view: "files",
      fileOpenRequest: null,
    });
  });

  it("opens and closes files for one session group", () => {
    useWorkspaceSidebarStore.getState().openFiles("group-1");
    expect(useWorkspaceSidebarStore.getState().filesSessionGroupId).toBe("group-1");

    useWorkspaceSidebarStore.getState().closeFiles();
    expect(useWorkspaceSidebarStore.getState().filesSessionGroupId).toBeNull();
  });

  it("opens directly into changes and switches resource views", () => {
    useWorkspaceSidebarStore.getState().openFiles("group-1", "changes");
    expect(useWorkspaceSidebarStore.getState().view).toBe("changes");

    useWorkspaceSidebarStore.getState().setView("files");
    expect(useWorkspaceSidebarStore.getState().view).toBe("files");
  });

  it("toggles files for the active session group", () => {
    useWorkspaceSidebarStore.getState().toggleFiles("group-1");
    expect(useWorkspaceSidebarStore.getState().filesSessionGroupId).toBe("group-1");

    useWorkspaceSidebarStore.getState().toggleFiles("group-1");
    expect(useWorkspaceSidebarStore.getState().filesSessionGroupId).toBeNull();
  });

  it("clears only the file request that was consumed", () => {
    useWorkspaceSidebarStore.getState().requestFileOpen("group-1", "src/App.tsx");
    const request = useWorkspaceSidebarStore.getState().fileOpenRequest;
    expect(request).toMatchObject({
      sessionGroupId: "group-1",
      filePath: "src/App.tsx",
      kind: "file",
    });

    useWorkspaceSidebarStore.getState().consumeFileOpenRequest("another-request");
    expect(useWorkspaceSidebarStore.getState().fileOpenRequest).toBe(request);

    useWorkspaceSidebarStore.getState().consumeFileOpenRequest(request?.id ?? "");
    expect(useWorkspaceSidebarStore.getState().fileOpenRequest).toBeNull();
  });

  it("includes diff metadata when opening a changed file", () => {
    useWorkspaceSidebarStore.getState().requestDiffOpen("group-1", "src/App.tsx", "modified");
    expect(useWorkspaceSidebarStore.getState().fileOpenRequest).toMatchObject({
      sessionGroupId: "group-1",
      filePath: "src/App.tsx",
      kind: "diff",
      status: "modified",
    });
  });
});
