import { describe, expect, it } from "vitest";
import {
  designSourceHash,
  readStaticDesignElementText,
  updateStaticDesignElementText,
  validateDesignElementId,
  validateDesignSourcePath,
} from "./design-manual-edit.js";

const FILE_PATH = "src/design/screens/WelcomeScreen.tsx";

describe("design manual text editing", () => {
  it("reads and updates static JSX text without reformatting the file", () => {
    const source = `export function Screen() {
  return (
    <h1 data-trace-id="hero-title" data-trace-source="${FILE_PATH}">
      Processing
    </h1>
  );
}
`;

    expect(readStaticDesignElementText(source, FILE_PATH, "hero-title")).toEqual({
      filePath: FILE_PATH,
      elementId: "hero-title",
      text: "Processing",
      sourceHash: designSourceHash(source),
    });

    const result = updateStaticDesignElementText(source, FILE_PATH, "hero-title", "Under review");

    expect(result.previousText).toBe("Processing");
    expect(result.text).toBe("Under review");
    expect(result.source).toBe(source.replace("Processing", "Under review"));
    expect(result.sourceHash).toBe(designSourceHash(result.source));
  });

  it("updates a static string JSX expression", () => {
    const source = `const screen = <span data-trace-id="status">{"Processing"}</span>;`;
    const result = updateStaticDesignElementText(source, FILE_PATH, "status", "Under review");

    expect(result.source).toBe(
      `const screen = <span data-trace-id="status">{"Under review"}</span>;`,
    );
  });

  it("escapes text that would otherwise become JSX", () => {
    const source = `const screen = <span data-trace-id="status">Processing</span>;`;
    const result = updateStaticDesignElementText(source, FILE_PATH, "status", "A < B & C");

    expect(result.source).toContain("A &lt; B &amp; C");
    expect(readStaticDesignElementText(result.source, FILE_PATH, "status").text).toBe("A < B & C");
  });

  it("rejects dynamic, nested, missing, and duplicate targets", () => {
    expect(() =>
      readStaticDesignElementText(
        `const screen = <span data-trace-id="status">{loan.status}</span>;`,
        FILE_PATH,
        "status",
      ),
    ).toThrow("dynamic or nested content");
    expect(() =>
      readStaticDesignElementText(
        `const screen = <span data-trace-id="status"><strong>Processing</strong></span>;`,
        FILE_PATH,
        "status",
      ),
    ).toThrow("dynamic or nested content");
    expect(() =>
      readStaticDesignElementText(`const screen = <span>Processing</span>;`, FILE_PATH, "status"),
    ).toThrow("not found");
    expect(() =>
      readStaticDesignElementText(
        `const screen = <><span data-trace-id="status">One</span><span data-trace-id="status">Two</span></>;`,
        FILE_PATH,
        "status",
      ),
    ).toThrow("not unique");
  });

  it("validates editable paths, ids, and text values", () => {
    expect(validateDesignSourcePath(FILE_PATH)).toBe(FILE_PATH);
    expect(validateDesignElementId("loan.status:label")).toBe("loan.status:label");
    expect(() => validateDesignSourcePath("src/App.tsx")).toThrow("under src/design");
    expect(() => validateDesignSourcePath("../secret.tsx")).toThrow("under src/design");
    expect(() => validateDesignElementId("bad id")).toThrow("Invalid design element id");
    expect(() =>
      updateStaticDesignElementText(
        `const screen = <span data-trace-id="status">Processing</span>;`,
        FILE_PATH,
        "status",
        "  ",
      ),
    ).toThrow("cannot be empty");
  });
});
