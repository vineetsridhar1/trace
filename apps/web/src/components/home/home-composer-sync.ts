export class HomeComposerTextSync {
  constructor(private editorText: string) {}

  recordEditorText(text: string): void {
    this.editorText = text;
  }

  takeExternalText(externalText: string): string | null {
    if (externalText === this.editorText) return null;
    this.editorText = externalText;
    return externalText;
  }
}
