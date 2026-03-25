import { Lock } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { useAuthStore } from "../../stores/auth";

export function DmWelcome({ chatId }: { chatId: string }) {
  const type = useEntityField("chats", chatId, "type");
  const members = useEntityField("chats", chatId, "members") as
    | Array<{ user: { id: string; name: string; avatarUrl?: string } }>
    | undefined;
  const currentUserId = useAuthStore((s) => s.user?.id);

  if (type !== "dm" || !members) return null;

  const other = members.find((m) => m.user.id !== currentUserId);
  if (!other) return null;

  const { name, avatarUrl } = other.user;

  return (
    <div className="px-5 pb-6 pt-10">
      <div className="mb-4 flex items-end gap-4">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="h-24 w-24 rounded-2xl ring-2 ring-border" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-muted text-3xl font-bold text-muted-foreground ring-2 ring-border">
            {name[0]?.toUpperCase()}
          </div>
        )}
      </div>
      <h3 className="text-2xl font-bold text-foreground">{name}</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        This is the beginning of your direct message history with{" "}
        <span className="font-semibold text-foreground">@{name}</span>.
      </p>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock size={11} />
        <span>Messages are only visible to you and {name}.</span>
      </div>
    </div>
  );
}
