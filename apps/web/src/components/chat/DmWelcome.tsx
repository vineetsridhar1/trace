import { useEntityField } from "@trace/client-core";
import { useAuthStore, type AuthState } from "@trace/client-core";

export function DmWelcome({ chatId }: { chatId: string }) {
  const type = useEntityField("chats", chatId, "type");
  const members = useEntityField("chats", chatId, "members") as
    | Array<{ user: { id: string; name: string; avatarUrl?: string } }>
    | undefined;
  const currentUserId = useAuthStore((s: AuthState) => s.user?.id);

  if (type !== "dm" || !members) return null;

  const other = members.find((m) => m.user.id !== currentUserId);
  if (!other) return null;

  const { name, avatarUrl } = other.user;

  return (
    <div className="px-5 pb-4 pt-8">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className="h-20 w-20 rounded-xl"
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-muted text-2xl font-bold text-muted-foreground">
          {name[0]?.toUpperCase()}
        </div>
      )}
      <h3 className="mt-3 text-xl font-bold text-foreground">{name}</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        This conversation is just between{" "}
        <span className="rounded bg-blue-500/20 px-1 py-0.5 text-blue-400">@{name}</span>
        {" "}and you.
      </p>
    </div>
  );
}
