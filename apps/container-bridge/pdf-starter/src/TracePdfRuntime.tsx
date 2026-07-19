import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import formatSource from "../document.format.json";

type DocumentFormat = { width: number; height: number; unit: "mm" | "in" };
const DEFAULT_FORMAT: DocumentFormat = { width: 210, height: 297, unit: "mm" };
const MAX_SIZE_INCHES = 200;

function validFormat(value: unknown): DocumentFormat {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_FORMAT;
  const source = value as Partial<DocumentFormat>;
  if (
    typeof source.width !== "number" ||
    typeof source.height !== "number" ||
    !Number.isFinite(source.width) ||
    !Number.isFinite(source.height) ||
    (source.unit !== "mm" && source.unit !== "in")
  )
    return DEFAULT_FORMAT;
  const divisor = source.unit === "mm" ? 25.4 : 1;
  if (
    source.width / divisor < 0.5 ||
    source.height / divisor < 0.5 ||
    source.width / divisor > MAX_SIZE_INCHES ||
    source.height / divisor > MAX_SIZE_INCHES
  )
    return DEFAULT_FORMAT;
  return { width: source.width, height: source.height, unit: source.unit };
}

export function TracePdfRuntime({ children }: { children: ReactNode }) {
  const pageRef = useRef<HTMLElement>(null);
  const [format, setFormat] = useState<DocumentFormat>(() => validFormat(formatSource));
  const pageStyle = useMemo(
    () =>
      `@page { size: ${format.width}${format.unit} ${format.height}${format.unit}; margin: 0; }`,
    [format],
  );

  useEffect(() => {
    const receiveMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      const message = event.data as { source?: unknown; type?: unknown; format?: unknown };
      if (message.source === "trace" && message.type === "pdf:format") {
        setFormat(validFormat(message.format));
      }
    };
    window.addEventListener("message", receiveMessage);
    return () => window.removeEventListener("message", receiveMessage);
  }, []);

  useEffect(() => {
    const reportSize = () => {
      window.parent.postMessage(
        {
          source: "trace-pdf-preview",
          type: "content-size",
          height: pageRef.current?.scrollHeight ?? 0,
        },
        "*",
      );
    };
    const observer = new ResizeObserver(reportSize);
    if (pageRef.current) observer.observe(pageRef.current);
    reportSize();
    window.addEventListener("load", reportSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("load", reportSize);
    };
  }, [format]);

  return (
    <main className="min-h-screen bg-white text-stone-900">
      <style>{pageStyle}</style>
      <article
        ref={pageRef}
        className="trace-pdf-page bg-white"
        style={{
          width: `${format.width}${format.unit}`,
          minHeight: `${format.height}${format.unit}`,
        }}
      >
        {children}
      </article>
    </main>
  );
}
