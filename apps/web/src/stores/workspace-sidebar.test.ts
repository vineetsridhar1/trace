import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceSidebarStore } from "./workspace-sidebar";

describe("workspace sidebar", () => {
  beforeEach(() => {
    useWorkspaceSidebarStore.setState({
      filesSessionGroupId: null,
      fileOpenRequest: null,
    });
  });

  it("opens and closes files for one session group", () => {
    useWorkspaceSidebarStore.getState().openFiles("group-1");
    expect(useWorkspaceSidebarStore.getState().filesSessionGroupId).toBe("group-1");

    useWorkspaceSidebarStore.getState().closeFiles();
    expect(useWorkspaceSidebarStore.getState().filesSessionGroupId).toBeNull();
  });

  it("clears only the file request that was consumed", () => {
    useWorkspaceSidebarStore.getState().requestFileOpen("group-1", "src/App.tsx");
    const request = useWorkspaceSidebarStore.getState().fileOpenRequest;
    expect(request).toMatchObject({ sessionGroupId: "group-1", filePath: "src/App.tsx" });

    useWorkspaceSidebarStore.getState().consumeFileOpenRequest("another-request");
    expect(useWorkspaceSidebarStore.getState().fileOpenRequest).toBe(request);

    useWorkspaceSidebarStore.getState().consumeFileOpenRequest(request?.id ?? "");
    expect(useWorkspaceSidebarStore.getState().fileOpenRequest).toBeNull();
  });
});
