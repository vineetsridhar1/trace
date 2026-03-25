import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import { useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useFileOpen } from "../session/FileOpenContext";

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

export function Markdown({ children }: { children: string }) {
  const fileOpen = useFileOpen();

  const linkComponent = useMemo(() => {
    if (!fileOpen) return ExternalLink;
    return function FileLink(props: ComponentPropsWithoutRef<"a">) {
      return <FileAwareLink {...props} onFileOpen={fileOpen} />;
    };
  }, [fileOpen]);

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: linkComponent }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
