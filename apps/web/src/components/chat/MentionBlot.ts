import Quill from "quill";

interface EmbedBlotInstance {
  statics: Record<string, unknown>;
}

interface EmbedBlotConstructor {
  new (): EmbedBlotInstance;
  blotName: string;
  tagName: string;
  className: string;
  create(value?: unknown): HTMLElement;
}

const Embed = Quill.import("blots/embed") as EmbedBlotConstructor;

class MentionBlot extends Embed {
  static blotName = "mention";
  static tagName = "span";
  static className = "mention";

  static create(data: { id: string; value: string; type: string }) {
    const node = super.create();
    node.setAttribute("data-mention-id", data.id);
    node.setAttribute("data-mention-value", data.value);
    node.setAttribute("data-mention-type", data.type);
    node.textContent = `${data.value}`;
    return node;
  }

  static value(node: HTMLElement) {
    return {
      id: node.getAttribute("data-mention-id"),
      value: node.getAttribute("data-mention-value"),
      type: node.getAttribute("data-mention-type"),
    };
  }
}

Quill.register("formats/mention", MentionBlot);

export { MentionBlot };
