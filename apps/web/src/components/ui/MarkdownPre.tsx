import type { ComponentPropsWithoutRef } from "react";
import type { ExtraProps } from "react-markdown";
import { MermaidDiagram } from "./MermaidDiagram";

export function MarkdownPre({
  node,
  children,
  ...props
}: ComponentPropsWithoutRef<"pre"> & ExtraProps) {
  const code = node?.children[0];
  if (
    node?.children.length === 1 &&
    code?.type === "element" &&
    code.tagName === "code" &&
    Array.isArray(code.properties.className) &&
    code.properties.className.some((name) => String(name).toLowerCase() === "language-mermaid") &&
    code.children.every((child) => child.type === "text")
  ) {
    const source = code.children
      .map((child) => (child.type === "text" ? child.value : ""))
      .join("");
    return <MermaidDiagram source={source} />;
  }
  return <pre {...props}>{children}</pre>;
}
