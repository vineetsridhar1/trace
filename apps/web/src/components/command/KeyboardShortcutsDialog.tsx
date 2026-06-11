import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { useCommandPaletteStore } from "../../stores/command-palette";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

interface Shortcut {
  keys: string[];
  label: string;
}

const SECTIONS: Array<{ heading: string; shortcuts: Shortcut[] }> = [
  {
    heading: "General",
    shortcuts: [
      { keys: [mod, "K"], label: "Open command palette" },
      { keys: ["?"], label: "Show keyboard shortcuts" },
      { keys: ["Esc"], label: "Close dialog or panel" },
    ],
  },
  {
    heading: "Navigation",
    shortcuts: [
      { keys: [mod, "B"], label: "Toggle sidebar" },
      { keys: [mod, "N"], label: "New session" },
      { keys: [mod, "⇧", "N"], label: "New private session" },
    ],
  },
  {
    heading: "Sessions",
    shortcuts: [
      { keys: [mod, "T"], label: "New tab" },
      { keys: [mod, "P"], label: "Find file" },
      { keys: [mod, "J"], label: "New terminal" },
      { keys: [mod, "⇧", "E"], label: "Toggle session sidebar" },
      { keys: [mod, "⇧", "A"], label: "Toggle applications panel" },
      { keys: [mod, "⏎"], label: "Toggle fullscreen" },
    ],
  },
  {
    heading: "Composer",
    shortcuts: [
      { keys: ["Enter"], label: "Send message" },
      { keys: ["⇧", "Enter"], label: "New line" },
    ],
  },
];

export function KeyboardShortcutsDialog() {
  const open = useCommandPaletteStore((s) => s.shortcutsOpen);
  const setOpen = useCommandPaletteStore((s) => s.setShortcutsOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Navigate and operate Trace without a mouse.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {SECTIONS.map((section) => (
            <div key={section.heading} className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">{section.heading}</p>
              {section.shortcuts.map((shortcut) => (
                <div key={shortcut.label} className="flex items-center justify-between gap-4 py-0.5">
                  <span className="text-sm text-foreground">{shortcut.label}</span>
                  <span className="flex items-center gap-1">
                    {shortcut.keys.map((key) => (
                      <kbd
                        key={key}
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 text-[11px] font-medium text-muted-foreground"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
