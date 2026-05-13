import { Markdown } from "../ui/Markdown";

export function MarkdownFileViewer({ content }: { content: string; filePath: string }) {
  return (
    <div className="native-scrollbar h-full overflow-auto bg-surface px-6 py-5">
      <div className="mx-auto max-w-4xl">
        <Markdown>{content}</Markdown>
      </div>
    </div>
  );
}
