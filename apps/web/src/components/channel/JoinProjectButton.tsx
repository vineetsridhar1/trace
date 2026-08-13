import { useState } from "react";
import { LogIn } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { joinChannel } from "../../lib/join-channel";
import { Button } from "../ui/button";

export function JoinProjectButton({ channelId }: { channelId: string }) {
  const viewerIsMember = useEntityField("channels", channelId, "viewerIsMember");
  const [joining, setJoining] = useState(false);

  if (viewerIsMember) return null;

  async function handleJoin() {
    setJoining(true);
    try {
      await joinChannel(channelId);
    } finally {
      setJoining(false);
    }
  }

  return (
    <Button size="sm" className="h-7 gap-1.5" onClick={() => void handleJoin()} disabled={joining}>
      <LogIn size={14} />
      {joining ? "Joining..." : "Join project"}
    </Button>
  );
}
