import { describe, expect, it } from "vitest";
import { pastedFilesFromClipboard } from "./clipboard";

function clipboardData({
  files = [],
  items = [],
}: {
  files?: File[];
  items?: DataTransferItem[];
}): Pick<DataTransfer, "files" | "items"> {
  return {
    files: files as unknown as FileList,
    items: items as unknown as DataTransferItemList,
  };
}

describe("pastedFilesFromClipboard", () => {
  it("returns clipboard images exposed only as items", () => {
    const image = new File(["image"], "clipboard.png", { type: "image/png" });
    const textItem = {
      kind: "string",
      type: "text/plain",
      getAsFile: () => null,
    } as unknown as DataTransferItem;
    const imageItem = {
      kind: "file",
      type: "image/png",
      getAsFile: () => image,
    } as unknown as DataTransferItem;

    expect(pastedFilesFromClipboard(clipboardData({ items: [textItem, imageItem] }))).toEqual([
      image,
    ]);
  });

  it("prefers the native file list when it is available", () => {
    const file = new File(["file"], "reference.pdf", { type: "application/pdf" });
    const imageItem = {
      kind: "file",
      type: "image/png",
      getAsFile: () => new File(["image"], "clipboard.png", { type: "image/png" }),
    } as unknown as DataTransferItem;

    expect(pastedFilesFromClipboard(clipboardData({ files: [file], items: [imageItem] }))).toEqual([
      file,
    ]);
  });
});
