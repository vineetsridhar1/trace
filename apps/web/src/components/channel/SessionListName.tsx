import { useEffect, useRef, useState } from "react";
import { useEntityField } from "@trace/client-core";
import { renameSessionGroup } from "../../lib/rename-session-group";
import { SessionGroupNameInlineEditor } from "./SessionGroupNameInlineEditor";

export function SessionListName({
  groupId,
  className,
  onOpen,
}: {
  groupId: string;
  className?: string;
  onOpen: () => void;
}) {
  const name = useEntityField("sessionGroups", groupId, "name") ?? "Untitled workspace";
  const [editing, setEditing] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(clickTimer.current), []);

  if (editing) {
    return (
      <SessionGroupNameInlineEditor
        className="h-6 text-xs"
        initialName={name}
        onCancel={() => setEditing(false)}
        onSubmit={(value) => {
          setEditing(false);
          void renameSessionGroup(groupId, value);
        }}
      />
    );
  }

  return (
    <span
      className={className}
      data-session-name
      title="Double-click to rename"
      onClick={(event) => {
        event.stopPropagation();
        clearTimeout(clickTimer.current);
        if (event.detail < 2) clickTimer.current = setTimeout(onOpen, 400);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        clearTimeout(clickTimer.current);
        setEditing(true);
      }}
    >
      {name}
    </span>
  );
}
