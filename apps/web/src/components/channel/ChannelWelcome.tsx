import { Hash, Sparkles, MessageSquare, Users } from "lucide-react";
import { useEntityField } from "../../stores/entity";

function WelcomeStat({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface-deep px-3 py-2 text-sm text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
  );
}

export function ChannelWelcome({ channelId }: { channelId: string }) {
  const name = useEntityField("channels", channelId, "name");

  return (
    <div className="px-4 pb-8 pt-10">
      <div className="mb-3 flex items-center gap-3">
        <div className="rounded-xl bg-surface-deep p-2">
          <Hash size={32} strokeWidth={2.5} className="text-foreground" />
        </div>
        <h1 className="text-3xl font-bold text-foreground">{name}</h1>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        This is the very beginning of the{" "}
        <span className="font-semibold text-foreground">#{name}</span> channel.
        Start the conversation!
      </p>
      <div className="flex flex-wrap gap-2">
        <WelcomeStat icon={<Sparkles size={14} />} label="AI-powered" />
        <WelcomeStat icon={<MessageSquare size={14} />} label="Real-time messaging" />
        <WelcomeStat icon={<Users size={14} />} label="Team collaboration" />
      </div>
    </div>
  );
}
