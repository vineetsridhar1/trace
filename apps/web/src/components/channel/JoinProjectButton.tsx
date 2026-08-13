import { useState } from "react";
import { LogIn } from "lucide-react";
import { gql } from "@urql/core";
import { useEntityField } from "@trace/client-core";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";

const JOIN_PROJECT_MUTATION = gql`
  mutation JoinProject($channelId: ID!) {
    joinChannel(channelId: $channelId) {
      id
    }
  }
`;

export function JoinProjectButton({ channelId }: { channelId: string }) {
  const viewerIsMember = useEntityField("channels", channelId, "viewerIsMember");
  const [joining, setJoining] = useState(false);

  if (viewerIsMember) return null;

  async function handleJoin() {
    setJoining(true);
    try {
      await client.mutation(JOIN_PROJECT_MUTATION, { channelId }).toPromise();
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
