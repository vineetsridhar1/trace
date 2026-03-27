import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";

interface LlmCallData {
  id: string;
  turnNumber: number;
  model: string;
  provider: string;
  systemPrompt: string;
  messages: unknown[];
  tools: unknown[];
  maxTokens: number | null;
  temperature: number | null;
  responseContent: unknown[];
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  latencyMs: number;
  createdAt: string;
}

export type { LlmCallData };

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {open && <div className="px-3 pb-3 border-t border-border">{children}</div>}
    </div>
  );
}

function MessageCard({ message }: { message: Record<string, unknown> }) {
  const role = String(message.role ?? "unknown");
  const roleColor =
    role === "assistant"
      ? "text-blue-400"
      : role === "user"
        ? "text-green-400"
        : "text-yellow-400";

  return (
    <div className="rounded border border-border bg-surface-deep p-2 space-y-1">
      <span className={cn("text-xs font-semibold uppercase", roleColor)}>{role}</span>
      <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">
        {typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content, null, 2)}
      </pre>
    </div>
  );
}

export function LlmCallDetail({ call }: { call: LlmCallData }) {
  const messages = Array.isArray(call.messages) ? call.messages : [];
  const responseContent = Array.isArray(call.responseContent) ? call.responseContent : [];

  return (
    <div className="space-y-3">
      <CollapsibleSection title={`System Prompt (${call.systemPrompt.length.toLocaleString()} chars)`}>
        <pre className="mt-2 text-xs font-mono text-foreground whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto">
          {call.systemPrompt}
        </pre>
      </CollapsibleSection>

      <CollapsibleSection title={`Messages (${messages.length})`} defaultOpen>
        <div className="mt-2 space-y-2">
          {messages.map((msg, i) => (
            <MessageCard key={i} message={msg as Record<string, unknown>} />
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title={`Response (${responseContent.length} block${responseContent.length !== 1 ? "s" : ""})`} defaultOpen>
        <div className="mt-2 space-y-2">
          {responseContent.map((block, i) => {
            const b = block as Record<string, unknown>;
            const isToolUse = b.type === "tool_use";
            return (
              <div key={i} className="rounded border border-border bg-surface-deep p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-purple-400 uppercase">
                    {String(b.type ?? "unknown")}
                  </span>
                  {isToolUse && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {String(b.name ?? "")}
                    </span>
                  )}
                </div>
                <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">
                  {isToolUse
                    ? JSON.stringify(b.input, null, 2)
                    : typeof b.text === "string"
                      ? b.text
                      : JSON.stringify(b, null, 2)}
                </pre>
              </div>
            );
          })}
        </div>
      </CollapsibleSection>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Stop reason: <span className="font-mono text-foreground">{call.stopReason}</span></span>
      </div>
    </div>
  );
}
