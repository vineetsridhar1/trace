import { useEffect, useMemo, useState } from "react";
import { FileCode, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { Button } from "../ui/button";
import { TraceLoader } from "../ui/trace-loader";
import { FileIcon } from "./FileIcon";
import { searchFilePaths } from "./file-fuzzy-search";

const MAX_FILE_RESULTS = 80;

interface FileCommandPaletteProps {
  open: boolean;
  files: string[];
  loading: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => Promise<void>;
  onOpenFile: (filePath: string) => void;
}

export function FileCommandPalette({
  open,
  files,
  loading,
  error,
  onOpenChange,
  onRefresh,
  onOpenFile,
}: FileCommandPaletteProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const results = useMemo(
    () => (hasQuery ? searchFilePaths(files, trimmedQuery, MAX_FILE_RESULTS) : []),
    [files, hasQuery, trimmedQuery],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-4rem)] w-[min(92vw,980px)] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#111111] p-0 shadow-2xl sm:max-w-[980px]"
      >
        <DialogTitle className="sr-only">Open file</DialogTitle>
        <DialogDescription className="sr-only">
          Search repository files and open the selected path in a file tab.
        </DialogDescription>
        <Command shouldFilter={false} loop className="rounded-lg bg-[#111111]">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search files by name or path"
            autoFocus
          />
          <CommandList>
            {!hasQuery ? (
              <div className="flex h-28 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
                <FileCode size={18} />
                <p>Start typing to search files.</p>
              </div>
            ) : loading ? (
              <div className="flex h-24 items-center justify-center">
                <TraceLoader size={16} showLabel={false} />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void onRefresh()}>
                  <RefreshCw size={14} />
                  Retry
                </Button>
              </div>
            ) : (
              <>
                {results.length > 0 && (
                  <CommandGroup>
                    {results.map(({ path }) => {
                      const fileName = path.split("/").pop() ?? path;
                      const directory = path.slice(
                        0,
                        Math.max(0, path.length - fileName.length - 1),
                      );
                      return (
                        <CommandItem
                          key={path}
                          value={path}
                          onSelect={() => {
                            onOpenFile(path);
                            onOpenChange(false);
                          }}
                          className="h-9 rounded-md px-3 text-[13px]"
                        >
                          <FileIcon path={path} size={16} />
                          <div className="flex min-w-0 flex-1 items-baseline">
                            <span className="truncate font-medium text-[#d4d4d4]">{fileName}</span>
                            {directory && (
                              <span className="ml-2 truncate text-[#858585]">{directory}</span>
                            )}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
                {files.length > 0 && results.length === 0 && (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No files found.
                  </div>
                )}
                {hasQuery && files.length === 0 && (
                  <div className="flex h-24 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    <FileCode size={16} />
                    No files found
                  </div>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
