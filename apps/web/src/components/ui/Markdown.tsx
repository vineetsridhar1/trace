import type { ComponentPropsWithoutRef, MouseEvent, ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useFileOpen } from "../session/FileOpenContext";
import { SteerableMarkdownBlock } from "./SteerableMarkdownBlock";
import {
  createSteerableBlocksPlugin,
  type MarkdownSteerBlock,
} from "./markdownSteering";

interface MarkdownProps {
  children: string;
  steerableBlocks?: boolean;
  onSteerBlock?: (block: MarkdownSteerBlock, feedback: string) => Promise<void> | void;
}

interface SteerableDivProps extends ComponentPropsWithoutRef<"div"> {
  node?: unknown;
  "data-steer-block-id"?: unknown;
  "data-steer-block-markdown"?: unknown;
  "data-steer-block-type"?: unknown;
}

function getDataString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Returns true if href looks like a file path (not a URL, anchor, or other scheme). */
function isFilePath(href: string): boolean {
  if (!href) return false;
  // Reject anything with a URL scheme (http:, ftp:, javascript:, data:, tel:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
  if (href.startsWith("#")) return false;
  // Must look like a path — contains a slash or a file extension
  return href.includes("/") || href.includes(".");
}

function ExternalLink(props: ComponentPropsWithoutRef<"a">) {
  return <a {...props} target="_blank" rel="noopener noreferrer" />;
}

/** Normalize a file path for the file viewer (collapse ./ prefix). */
function normalizeFilePath(href: string): string {
  let p = href;
  if (p.startsWith("./")) p = p.slice(2);
  return p;
}

function FileAwareLink({
  onFileOpen,
  ...props
}: ComponentPropsWithoutRef<"a"> & { onFileOpen: (filePath: string) => void }) {
  const handleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      const href = props.href;
      if (href && isFilePath(href)) {
        e.preventDefault();
        onFileOpen(normalizeFilePath(href));
      }
    },
    [props.href, onFileOpen],
  );

  const href = props.href;
  if (href && isFilePath(href)) {
    return <a {...props} href="#" onClick={handleClick} />;
  }
  return <a {...props} target="_blank" rel="noopener noreferrer" />;
}

export function Markdown({ children, steerableBlocks = false, onSteerBlock }: MarkdownProps) {
  const fileOpen = useFileOpen();
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  const linkComponent = useMemo(() => {
    if (!fileOpen) return ExternalLink;
    return function FileLink(props: ComponentPropsWithoutRef<"a">) {
      return <FileAwareLink {...props} onFileOpen={fileOpen} />;
    };
  }, [fileOpen]);

  const handleSubmitSteerBlock = useCallback(
    async (block: MarkdownSteerBlock, feedback: string) => {
      if (!onSteerBlock) return;
      await onSteerBlock(block, feedback);
      setActiveBlockId(null);
    },
    [onSteerBlock],
  );

  const components = useMemo<Components>(() => {
    if (!steerableBlocks || !onSteerBlock) {
      return { a: linkComponent };
    }

    function SteerableDiv({
      children: blockChildren,
      node: _node,
      "data-steer-block-id": rawBlockId,
      "data-steer-block-markdown": rawBlockMarkdown,
      "data-steer-block-type": rawBlockType,
      ...props
    }: SteerableDivProps) {
      const blockId = getDataString(rawBlockId);
      const blockMarkdown = getDataString(rawBlockMarkdown);
      const blockType = getDataString(rawBlockType);

      if (!blockId || !blockMarkdown || !blockType) {
        return <div {...props}>{blockChildren}</div>;
      }

      return (
        <SteerableMarkdownBlock
          block={{ id: blockId, markdown: blockMarkdown, type: blockType }}
          active={activeBlockId === blockId}
          onOpen={setActiveBlockId}
          onCancel={() => setActiveBlockId(null)}
          onSubmit={handleSubmitSteerBlock}
        >
          {blockChildren as ReactNode}
        </SteerableMarkdownBlock>
      );
    }

    return { a: linkComponent, div: SteerableDiv };
  }, [activeBlockId, handleSubmitSteerBlock, linkComponent, onSteerBlock, steerableBlocks]);

  const rehypePlugins = useMemo(() => {
    if (!steerableBlocks || !onSteerBlock) return [];
    return [createSteerableBlocksPlugin(children)];
  }, [children, onSteerBlock, steerableBlocks]);

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
