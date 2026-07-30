export function externalPromptNeedsSync(externalPrompt: string, lastEditorText: string): boolean {
  return externalPrompt !== lastEditorText;
}
