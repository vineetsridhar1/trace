import { MessageCircle } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { useAuthStore } from "../../stores/auth";
import { SidebarTrigger } from "../ui/sidebar";
import { AddMemberDialog } from "./AddMemberDialog";

export function ChatHeader({ chatId }: { chatId: string }) {
  const name = useEntityField("chats", chatId, "name");
  const type = useEntityField("chats", chatId, "type");
  const members = useEntityField("chats", chatId, "members") as
    | Array<{ user: { id: string; name: string } }>
    | undefined;
  const currentUserId = useAuthStore((s) => s.user?.id);

  const otherMember = members?.find((member) => member.user.id !== currentUserId);
  const displayName = name ?? (type === "dm" ? (otherMember?.user.name ?? "Direct Message") : "Group Chat");

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
