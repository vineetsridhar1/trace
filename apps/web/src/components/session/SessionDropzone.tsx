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

  // Keep the DOM structure identical whether or not dropping is enabled.
  // Toggling `disabled` must not change the children's nesting depth, or React
  // would remount the wrapped subtree (e.g. the virtualized message list) on
  // ordinary session transitions like a plan or question appearing.
  return (
    <div
      className={cn("relative", className)}
      onDragEnter={disabled ? undefined : handleDragEnter}
      onDragOver={disabled ? undefined : handleDragOver}
      onDragLeave={disabled ? undefined : handleDragLeave}
      onDrop={disabled ? undefined : handleDrop}
    >
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden transition-all duration-200",
          !disabled && isDragging && "blur",
        )}
      >
        {children}
      </div>
      {!disabled && (
        <div
          className={cn(
            "absolute inset-0 z-50 flex flex-col items-center justify-center rounded-md border border-dashed border-accent-foreground bg-background/50 transition-all duration-200",
            !isDragging && "hidden",
          )}
        >
          <Upload className="mb-4 size-12 text-foreground" />
          <span className="text-xl font-semibold text-foreground">Drop files to attach</span>
        </div>
      )}
    </div>
  );
}
