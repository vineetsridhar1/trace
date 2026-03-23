import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import { useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useFileOpen } from "../session/FileOpenContext";

/** Returns true if href looks like a relative file path (not a URL or anchor). */
function isFilePath(href: string): boolean {
  if (!href) return false;
  if (/^https?:\/\//i.test(href)) return false;
  if (href.startsWith("#") || href.startsWith("mailto:")) return false;
  return true;
}

function ExternalLink(props: ComponentPropsWithoutRef<"a">) {
  return <a {...props} target="_blank" rel="noopener noreferrer" />;
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
        onFileOpen(href);
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

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: fileOpen
            ? (props) => <FileAwareLink {...props} onFileOpen={fileOpen} />
            : ExternalLink,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
