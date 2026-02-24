import { useRef, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ServerEvent, PlanReviewNode } from '../types';
import { extractPromptText, formatTime, isEditLikeEvent, normalizeToolName, serializeUnknown, findStringByKeys, toRelativeDisplayPath, stripTraceInternal } from '../utils';
import { EditDiffPreview } from './EditDiffPreview';

function ExpandableText({ text, lineClamp = 3 }: { text: string; lineClamp?: number }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [needsClamp, setNeedsClamp] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [collapsedH, setCollapsedH] = useState(0);
  const [fullH, setFullH] = useState(0);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const clampH = Math.ceil(lh * lineClamp);
    const scrollH = el.scrollHeight;
    if (scrollH > clampH + 4) {
      setNeedsClamp(true);
      setCollapsedH(clampH);
      setFullH(scrollH);
    } else {
      setNeedsClamp(false);
    }
  }, [text, lineClamp]);

  return (
    <div>
      <div
        style={{
          maxHeight: !needsClamp ? undefined : expanded ? `${fullH}px` : `${collapsedH}px`,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
        }}
      >
        <div ref={innerRef} className="markdown-body break-words text-sm text-[#c0caf5]">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      </div>
      {needsClamp && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1 cursor-pointer text-xs font-medium text-violet-400 hover:text-violet-300"
        >
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  );
}

export function ThreadEvent({ event }: { event: ServerEvent }) {
  const time = formatTime(event.timestamp);

  if (event.hookEventName === 'UserPromptSubmit') {
    return <UserPromptBubble event={event} time={time} />;
  }

  if (event.hookEventName === 'PostToolUse') {
    return <ToolUseRow event={event} time={time} />;
  }

  if (event.hookEventName === 'Stop') {
    return <StopBubble event={event} time={time} />;
  }

  return <GenericEventRow event={event} time={time} />;
}

function UserPromptBubble({ event, time }: { event: ServerEvent; time: string }) {
  const rawPrompt =
    extractPromptText(event.rawPayload) ?? event.lastAssistantMessage ?? '(prompt)';
  const prompt = stripTraceInternal(rawPrompt);

  return (
    <div className="thread-bubble flex justify-end">
      <div className="max-w-[85%] rounded-xl rounded-br-sm border border-violet-500/40 bg-violet-500/15 px-3 py-2">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold text-violet-300">You</span>
          <span className="text-xs text-[#565f89]">{time}</span>
        </div>
        <ExpandableText text={prompt} lineClamp={4} />
      </div>
    </div>
  );
}

function isWriteEvent(event: ServerEvent): boolean {
  return event.hookEventName === 'PostToolUse' && normalizeToolName(event.toolName) === 'write';
}

function isTodoWriteEvent(event: ServerEvent): boolean {
  return event.hookEventName === 'PostToolUse' && normalizeToolName(event.toolName) === 'todowrite';
}

function WriteCodePreview({ event }: { event: ServerEvent }) {
  const content = findStringByKeys(event.toolInput, ['content', 'text', 'new_source']) ?? null;
  const rawPath = findStringByKeys(event.toolInput, ['file_path', 'path', 'filepath']) ?? null;
  const displayPath = rawPath ? toRelativeDisplayPath(rawPath) : 'file';

  if (!content) return null;

  return (
    <div className="mt-2">
      <div className="edit-diff-meta mb-1 text-[11px] font-semibold text-[#a9b1d6]">
        Write &middot; {displayPath}
      </div>
      <div className="overflow-hidden rounded-md border border-[#3b3f5c]">
      <div className="border-b border-[#3b3f5c] bg-[#1a1b26] px-2 py-1 text-[11px] font-semibold text-[#a9b1d6]">
        {displayPath}
      </div>
      <pre className="max-h-[340px] overflow-auto bg-[#16161e] p-2 font-mono text-xs leading-relaxed text-[#c0caf5]">
        {content.length > 5000 ? `${content.slice(0, 5000)}...` : content}
      </pre>
      </div>
    </div>
  );
}

interface TodoItem {
  content: string;
  status: string;
}

function TodoSpinner() {
  return (
    <svg
      className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-violet-400"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  );
}

function TodoListPreview({ event }: { event: ServerEvent }) {
  const input = event.toolInput as Record<string, unknown> | null;
  const todos = (input?.todos ?? []) as TodoItem[];
  if (!Array.isArray(todos) || todos.length === 0) return null;

  return (
    <ul className="mt-2 space-y-1.5 pl-1">
      {todos.map((t, i) => (
        <li key={i} className="flex items-center gap-2 text-sm">
          {t.status === 'in_progress' ? (
            <TodoSpinner />
          ) : t.status === 'completed' ? (
            <svg className="h-3.5 w-3.5 flex-shrink-0 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border border-[#565f89]" />
          )}
          <span className={t.status === 'completed' ? 'text-[#565f89] line-through' : 'text-[#c0caf5]'}>
            {t.content}
          </span>
        </li>
      ))}
    </ul>
  );
}

function isBashEvent(event: ServerEvent): boolean {
  return event.hookEventName === 'PostToolUse' && normalizeToolName(event.toolName) === 'bash';
}

function BashToolRow({ event, time }: { event: ServerEvent; time: string }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  const input = event.toolInput as Record<string, unknown> | null;
  const command = (typeof input?.command === 'string' ? input.command : null);
  const output = event.toolResponse ? serializeUnknown(event.toolResponse, 2000) : null;

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [output, open]);

  return (
    <div className="tool-cmd-row">
      <button
        type="button"
        className="tool-cmd-button"
        onClick={() => setOpen(!open)}
      >
        <span className="tool-cmd-chevron" style={{ transform: open ? 'rotate(90deg)' : undefined }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
            <path d="M3 1.5L7 5 3 8.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </span>
        <code className="tool-cmd-code">{command ?? `${event.toolName ?? 'Tool'} executed`}</code>
        <span className="tool-cmd-time">{time}</span>
      </button>
      <div
        className="tool-cmd-body"
        style={{ maxHeight: open ? `${bodyHeight}px` : '0px' }}
      >
        <div ref={bodyRef}>
          {output && (
            <pre className="tool-cmd-output">{output}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

function GenericToolRow({ event, time }: { event: ServerEvent; time: string }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  const hasToolInput = event.toolInput !== null && event.toolInput !== undefined;
  const output = event.toolResponse ? serializeUnknown(event.toolResponse, 2000) : null;

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [output, open]);

  const label = `${event.toolName ?? 'Tool'} executed`;

  return (
    <div className="tool-cmd-row">
      <button
        type="button"
        className="tool-cmd-button"
        onClick={() => setOpen(!open)}
      >
        <span className="tool-cmd-chevron" style={{ transform: open ? 'rotate(90deg)' : undefined }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
            <path d="M3 1.5L7 5 3 8.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </span>
        <code className="tool-cmd-code">{label}</code>
        <span className="tool-cmd-time">{time}</span>
      </button>
      <div
        className="tool-cmd-body"
        style={{ maxHeight: open ? `${bodyHeight}px` : '0px' }}
      >
        <div ref={bodyRef}>
          {hasToolInput && (
            <pre className="tool-cmd-output">{serializeUnknown(event.toolInput)}</pre>
          )}
          {output && (
            <pre className="tool-cmd-output">{output}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolUseRow({ event, time }: { event: ServerEvent; time: string }) {
  const editLike = isEditLikeEvent(event);
  const writeTool = isWriteEvent(event);
  const todoTool = isTodoWriteEvent(event);
  const bashTool = isBashEvent(event);

  if (bashTool) {
    return <BashToolRow event={event} time={time} />;
  }

  if (!editLike && !todoTool) {
    return <GenericToolRow event={event} time={time} />;
  }

  return (
    <div className="activity-row">
      {todoTool ? (
        <TodoListPreview event={event} />
      ) : writeTool ? (
        <WriteCodePreview event={event} />
      ) : (
        <EditDiffPreview event={event} />
      )}
    </div>
  );
}

function StopBubble({ event, time }: { event: ServerEvent; time: string }) {
  const message = event.lastAssistantMessage ? stripTraceInternal(event.lastAssistantMessage) : '';
  const stopReason = (event.rawPayload as Record<string, unknown>)?.stop_reason;
  const isUserStop = stopReason === 'user';
  const displayMessage = message || 'Claude completed the run.';

  if (isUserStop) {
    return (
      <div className="activity-row">
        <div className="activity-row-header">
          <span className="activity-row-icon text-red-400">&#9632;</span>
          <span className="activity-row-title text-red-300">Stopped by user</span>
          <span className="activity-row-time">{time}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="activity-row">
      <div className="activity-row-header">
        <span className="activity-row-icon">&#9632;</span>
        <span className="activity-row-title">Run ended</span>
        <span className="activity-row-time">{time}</span>
      </div>
      <div className="activity-row-note">
        <ExpandableText text={displayMessage} lineClamp={4} />
      </div>
    </div>
  );
}

function GenericEventRow({ event, time }: { event: ServerEvent; time: string }) {
  return (
    <div className="activity-row">
      <div className="activity-row-header">
        <span className="activity-row-icon">•</span>
        <span className="activity-row-title">{event.hookEventName}</span>
        <span className="activity-row-time">{time}</span>
      </div>
      <details className="activity-row-details mt-1">
        <summary>Details</summary>
        <pre className="mt-1">{serializeUnknown(event.rawPayload, 600)}</pre>
      </details>
    </div>
  );
}

export function PlanReview({ node }: { node: PlanReviewNode }) {
  const time = formatTime(node.event.timestamp);

  return (
    <div className="thread-bubble flex justify-start">
      <div className="w-full max-w-[95%] rounded-xl border border-violet-500/30 bg-[#1f2335] px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-violet-300">Plan Review</span>
          <span className="text-xs text-[#565f89]">{time}</span>
        </div>

        {node.planContent ? (
          <div className="markdown-body max-h-[500px] overflow-y-auto rounded-md border border-[#292e42] bg-[#16161e] p-3 text-sm text-[#c0caf5]">
            <ReactMarkdown>{node.planContent}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-sm text-[#565f89]">No plan content available.</div>
        )}
      </div>
    </div>
  );
}
