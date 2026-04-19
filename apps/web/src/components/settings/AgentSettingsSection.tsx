import { useState, useEffect, useCallback } from "react";
import { Save } from "lucide-react";
import { useAuthStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { features } from "../../lib/features";
import { gql } from "@urql/core";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
      {children}
    </label>
  );
}

const AGENT_IDENTITY_QUERY = gql`
  query AgentIdentity($organizationId: ID!) {
    agentIdentity(organizationId: $organizationId) {
      id
      name
      status
      autonomyMode
      soulFile
    }
  }
`;

const UPDATE_AGENT_SETTINGS = gql`
  mutation UpdateAgentSettings($organizationId: ID!, $input: UpdateAgentSettingsInput!) {
    updateAgentSettings(organizationId: $organizationId, input: $input) {
      id
      name
      status
      autonomyMode
      soulFile
    }
  }
`;

interface AgentIdentityData {
  id: string;
  name: string;
  status: string;
  autonomyMode: string;
  soulFile: string;
}

export function AgentSettingsSection() {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const [identity, setIdentity] = useState<AgentIdentityData | null>(null);
  const [soulFile, setSoulFile] = useState("");
  const [autonomyMode, setAutonomyMode] = useState("observe");
  const [status, setStatus] = useState("enabled");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIdentity = useCallback(async () => {
    if (!activeOrgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await client
      .query(AGENT_IDENTITY_QUERY, { organizationId: activeOrgId })
      .toPromise();
    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }
    const data = result.data?.agentIdentity as AgentIdentityData | undefined;
    if (data) {
      setIdentity(data);
      setSoulFile(data.soulFile);
      setAutonomyMode(data.autonomyMode);
      setStatus(data.status);
      setDirty(false);
    }
    setLoading(false);
  }, [activeOrgId]);

  useEffect(() => {
    fetchIdentity();
  }, [fetchIdentity]);

  async function handleSave() {
    if (!activeOrgId) return;
    setSaving(true);
    setError(null);
    const result = await client
      .mutation(UPDATE_AGENT_SETTINGS, {
        organizationId: activeOrgId,
        input: { soulFile, autonomyMode, status },
      })
      .toPromise();
    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setDirty(false);
    // Refetch to get the updated state from the server
    fetchIdentity();
  }

  function handleSoulFileChange(value: string) {
    setSoulFile(value);
    setDirty(true);
  }

  function handleAutonomyChange(value: string | null) {
    if (!value) return;
    setAutonomyMode(value);
    setDirty(true);
  }

  function handleStatusChange(value: string | null) {
    if (!value) return;
    setStatus(value);
    setDirty(true);
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">AI Agent</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure the ambient AI agent for your organization.
        </p>
      </div>

      {loading && (
        <div className="rounded-lg border border-border bg-surface-deep p-8 text-center">
          <p className="text-sm text-muted-foreground">Loading agent settings...</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">Failed to load agent settings: {error}</p>
        </div>
      )}

      {!loading && !error && !identity && (
        <div className="rounded-lg border border-border bg-surface-deep p-8 text-center">
          <p className="text-sm text-muted-foreground">Agent settings unavailable.</p>
        </div>
      )}

      {identity && (
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                className="space-y-4 rounded-lg border border-border bg-surface-deep p-4 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                aria-disabled={!features.agent || undefined}
              />
            }
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agent-status">Status</Label>
                <Select value={status} onValueChange={handleStatusChange} disabled={!features.agent}>
                  <SelectTrigger id="agent-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enabled">Enabled</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-autonomy">Autonomy Mode</Label>
                <Select value={autonomyMode} onValueChange={handleAutonomyChange} disabled={!features.agent}>
                  <SelectTrigger id="agent-autonomy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="observe">Observe</SelectItem>
                    <SelectItem value="suggest">Suggest</SelectItem>
                    <SelectItem value="act">Act</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="soul-file">Soul File</Label>
              <p className="text-xs text-muted-foreground">
                Markdown instructions that define the agent&apos;s personality, tone, and behavioral
                rules. Leave empty to use the platform default.
              </p>
              <Textarea
                id="soul-file"
                placeholder="Leave empty to use the platform default soul file..."
                value={soulFile}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleSoulFileChange(e.target.value)}
                className="font-mono text-xs min-h-[200px]"
                disabled={!features.agent}
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={!features.agent || !dirty || saving} size="sm">
                <Save size={14} className="mr-1.5" />
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </TooltipTrigger>
          {!features.agent && <TooltipContent>Coming soon</TooltipContent>}
        </Tooltip>
      )}
    </div>
  );
}
