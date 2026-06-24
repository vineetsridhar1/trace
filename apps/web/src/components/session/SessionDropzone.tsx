import { useCallback, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { cn } from "../../lib/utils";

const isFileDrag = (event: DragEvent<HTMLDivElement>) =>
  Array.from(event.dataTransfer.types).includes("Files");

export function SessionDropzone({
  onFileDropped,
  disabled,
  className,
  children,
}: {
  onFileDropped: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      onFileDropped(Array.from(event.dataTransfer.files));
    },
    [onFileDropped],
  );

  if (disabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden transition-all duration-200",
          isDragging && "blur",
        )}
      >
        {children}
      </div>
      <div
        className={cn(
          "absolute inset-0 z-50 flex flex-col items-center justify-center rounded-md border border-dashed border-accent-foreground bg-background/50 transition-all duration-200",
          !isDragging && "hidden",
        )}
      >
        <Upload className="mb-4 size-12 text-foreground" />
        <span className="text-xl font-semibold text-foreground">Drop files to attach</span>
      </div>
    </div>
  );
}
