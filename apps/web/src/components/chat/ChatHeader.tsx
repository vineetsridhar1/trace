import { MessageCircle } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { SidebarTrigger } from "../ui/sidebar";
import { AddMemberDialog } from "./AddMemberDialog";

export function ChatHeader({ chatId }: { chatId: string }) {
  const name = useEntityField("chats", chatId, "name");
  const type = useEntityField("chats", chatId, "type");

  const displayName = name ?? (type === "dm" ? "Direct Message" : "Group Chat");

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
      <SidebarTrigger />
      <MessageCircle size={16} className="text-muted-foreground" />
      <h2 className="text-sm font-semibold text-foreground">{displayName}</h2>
      {type === "group" && (
        <div className="ml-auto">
          <AddMemberDialog chatId={chatId} />
        </div>
      )}
    </div>
  );
}
