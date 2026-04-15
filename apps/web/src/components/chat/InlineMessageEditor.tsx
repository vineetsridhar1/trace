import { useRef, useState, useCallback } from "react";
import { Check, X } from "lucide-react";
import { useAuthStore, type AuthState } from "../../stores/auth";
import { useOrgMembers } from "../../hooks/useOrgMembers";
import { Button } from "../ui/button";
import { ChatEditor, type ChatEditorHandle } from "./ChatEditor";

export function InlineMessageEditor({
  initialHtml,
  onSave,
  onCancel,
}: {
  initialHtml: string;
  onSave: (html: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const editorRef = useRef<ChatEditorHandle>(null);
  const currentUserId = useAuthStore((s: AuthState) => s.user?.id);
  const mentionableUsers = useOrgMembers();

  const handleSubmit = useCallback(
    async (html: string) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      try {
        await onSave(html);
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [onSave],
  );

  return (
    <div className="rounded-lg border border-border bg-surface-deep p-3">
      <ChatEditor
        ref={editorRef}
        initialHtml={initialHtml}
        onSubmit={handleSubmit}
        placeholder="Edit message..."
        disabled={saving}
        mentionableUsers={mentionableUsers}
        currentUserId={currentUserId}
      />
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          <X size={14} />
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void editorRef.current?.submit()}
          disabled={saving}
        >
          <Check size={14} />
          Save
        </Button>
      </div>
    </div>
  );
}
