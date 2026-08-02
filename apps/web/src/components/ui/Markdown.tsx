import type { ComponentPropsWithoutRef, MouseEvent, ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useFileOpen,
  type FileOpenHandler,
} from "../session/FileOpenContext";
import { SteerableMarkdownBlock } from "./SteerableMarkdownBlock";
import { fileOpenRequestFromHref } from "./markdownFileLinks";
import {
  createSteerableBlocksPlugin,
  type MarkdownSteerCommentsByBlock,
  type MarkdownSteerBlock,
} from "./markdownSteering";

interface MarkdownProps {
  children: string;
  steerableBlocks?: boolean;
  comments?: MarkdownSteerCommentsByBlock;
  onAddComment?: (block: MarkdownSteerBlock, text: string) => void;
  onRemoveComment?: (blockId: string, commentId: string) => void;
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

function ExternalLink(props: ComponentPropsWithoutRef<"a">) {
  return <a {...props} target="_blank" rel="noopener noreferrer" />;
}

function FileAwareLink({
  onFileOpen,
  ...props
}: ComponentPropsWithoutRef<"a"> & { onFileOpen: FileOpenHandler }) {
  const handleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      const href = props.href;
      const request = href ? fileOpenRequestFromHref(href) : null;
      if (request) {
        e.preventDefault();
        onFileOpen(request);
      }
    },
    [props.href, onFileOpen],
  );

  const href = props.href;
  if (href && fileOpenRequestFromHref(href)) {
    return <a {...props} onClick={handleClick} />;
  }
  return <a {...props} target="_blank" rel="noopener noreferrer" />;
}

export function Markdown({
  children,
  steerableBlocks = false,
  comments,
  onAddComment,
  onRemoveComment,
}: MarkdownProps) {
  const fileOpen = useFileOpen();
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const canSteer = steerableBlocks && !!onAddComment && !!onRemoveComment;

  const linkComponent = useMemo(() => {
    if (!fileOpen) return ExternalLink;
    return function FileLink(props: ComponentPropsWithoutRef<"a">) {
      return <FileAwareLink {...props} onFileOpen={fileOpen} />;
    };
  }, [fileOpen]);

  const handleAddComment = useCallback(
    (block: MarkdownSteerBlock, text: string) => {
      onAddComment?.(block, text);
    },
    [onAddComment],
  );

  const handleRemoveComment = useCallback(
    (blockId: string, commentId: string) => {
      onRemoveComment?.(blockId, commentId);
    },
    [onRemoveComment],
  );

  const components = useMemo<Components>(() => {
    if (!canSteer) {
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
          comments={comments?.[blockId] ?? []}
          active={activeBlockId === blockId}
          onOpen={setActiveBlockId}
          onCancel={() => setActiveBlockId(null)}
          onAdd={handleAddComment}
          onRemove={handleRemoveComment}
        >
          {blockChildren as ReactNode}
        </SteerableMarkdownBlock>
      );
    }

    return { a: linkComponent, div: SteerableDiv };
  }, [
    activeBlockId,
    comments,
    canSteer,
    handleAddComment,
    handleRemoveComment,
    linkComponent,
  ]);

  const rehypePlugins = useMemo(() => {
    if (!canSteer) return [];
    return [createSteerableBlocksPlugin(children)];
  }, [canSteer, children]);

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
