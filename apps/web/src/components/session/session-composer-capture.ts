function isEditableTarget(target: EventTarget | null): boolean {
  return (
    typeof HTMLElement !== "undefined" &&
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

export function shouldCaptureComposerKey(event: KeyboardEvent): boolean {
  return (
    !event.defaultPrevented &&
    !event.isComposing &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.key.length === 1 &&
    !isEditableTarget(event.target)
  );
}

export function pastedComposerText(event: ClipboardEvent): string | null {
  if (event.defaultPrevented || isEditableTarget(event.target)) return null;
  const text = event.clipboardData?.getData("text/plain") ?? "";
  return text || null;
}
