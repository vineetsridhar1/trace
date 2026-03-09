import { useState, useRef, useEffect } from "react";
import { FiChevronDown, FiFileText, FiPlus } from "react-icons/fi";
import { useAppUIStore } from "../stores/appUIStore";

export function WorkspaceInput() {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  return (
    <div className="border-t border-edge px-3 py-2">
      <div className="relative flex">
        <button
          type="button"
          onClick={() => {
            setShowDropdown(false);
            useAppUIStore.getState().setShowNewWorkspaceModal(true);
          }}
          className="btn-primary flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-l-md px-3 py-1 text-xs font-medium"
        >
          <FiPlus className="h-3.5 w-3.5" aria-hidden="true" />
          New workspace
          <span className="ml-1 flex items-center gap-0.5 opacity-60">
            <kbd
              className="rounded px-1 py-0.5 text-[10px]"
              style={{ background: "rgba(0,0,0,0.15)" }}
            >
              &#8984;
            </kbd>
            <kbd
              className="rounded px-1 py-0.5 text-[10px]"
              style={{ background: "rgba(0,0,0,0.15)" }}
            >
              N
            </kbd>
          </span>
        </button>
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setShowDropdown(!showDropdown)}
            className="btn-primary flex h-full cursor-pointer items-center rounded-r-md border-l border-accent-light/30 px-2 py-1 text-on-accent"
          >
            <FiChevronDown className="h-3.5 w-3.5" />
          </button>
          {showDropdown && (
            <div className="absolute bottom-full right-0 z-50 mb-1 w-48 rounded-md border border-edge bg-surface-elevated py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setShowDropdown(false);
                  useAppUIStore.getState().setShowProductDocModal(true);
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-primary hover:bg-surface-hover"
              >
                <FiFileText className="h-3.5 w-3.5" aria-hidden="true" />
                New product doc
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
