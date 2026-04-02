import { useState, useEffect, useCallback } from "react";
import { Save } from "lucide-react";
import { useAuthStore, type AuthState } from "../../stores/auth";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const AGENT_IDENTITY_QUERY = gql`
  query AgentIdentityDebug($organizationId: ID!) {
    agentIdentity(organizationId: $organizationId) {
      id
      name
      status
      autonomyMode
      soulFile
      costBudget {
        dailyLimitCents
      }
    }
  }
`;

const UPDATE_AGENT_SETTINGS = gql`
  mutation UpdateAgentSettingsDebug($organizationId: ID!, $input: UpdateAgentSettingsInput!) {
    updateAgentSettings(organizationId: $organizationId, input: $input) {
      id
      name
      status
      autonomyMode
      soulFile
      costBudget {
        dailyLimitCents
      }
    }
  }
`;

interface AgentIdentity {
  id: string;
  name: string;
  status: string;
  autonomyMode: string;
  soulFile: string;
  costBudget: { dailyLimitCents: number };
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-muted-foreground">{children}</label>;
}

export function AgentSettingsTab() {
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const [identity, setIdentity] = useState<AgentIdentity | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("enabled");
  const [autonomyMode, setAutonomyMode] = useState("observe");
  const [soulFile, setSoulFile] = useState("");
  const [dailyLimitCents, setDailyLimitCents] = useState(1000);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIdentity = useCallback(async () => {
    if (!activeOrgId) return;
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
    const data = result.data?.agentIdentity as AgentIdentity | undefined;
    if (data) {
      setIdentity(data);
      setName(data.name);
      setStatus(data.status);
      setAutonomyMode(data.autonomyMode);
      setSoulFile(data.soulFile);
      setDailyLimitCents(data.costBudget.dailyLimitCents);
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
    const result = await client
      .mutation(UPDATE_AGENT_SETTINGS, {
        organizationId: activeOrgId,
        input: { name, status, autonomyMode, soulFile, dailyLimitCents },
      })
      .toPromise();
    setSaving(false);

    const data = result.data?.updateAgentSettings as AgentIdentity | undefined;
    if (data) {
      setIdentity(data);
      setDirty(false);
    }
  }

  function markDirty() {
    setDirty(true);
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-border bg-surface-deep p-8 text-center">
          <p className="text-sm text-muted-foreground">Loading agent settings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">Failed to load: {error}</p>
        </div>
      </div>
    );
  }

  if (!identity) return null;

  return (
    <div className="p-4 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground">Agent Settings</h2>
        <Button onClick={handleSave} disabled={!dirty || saving} size="sm">
          <Save size={14} className="mr-1.5" />
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>

      <div className="space-y-4">
        {/* Basic Settings */}
        <div className="rounded-lg border border-border bg-surface-deep p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Agent Name</Label>
              <Input
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setName(e.target.value); markDirty(); }}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v: string) => { if (v) { setStatus(v); markDirty(); } }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enabled">Enabled</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Autonomy Mode</Label>
              <Select value={autonomyMode} onValueChange={(v: string) => { if (v) { setAutonomyMode(v); markDirty(); } }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="observe">Observe</SelectItem>
                  <SelectItem value="suggest">Suggest</SelectItem>
                  <SelectItem value="act">Act</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Daily Budget (cents)</Label>
              <Input
                type="number"
                value={dailyLimitCents}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setDailyLimitCents(Number(e.target.value)); markDirty(); }}
                min={0}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Soul File */}
        <div className="rounded-lg border border-border bg-surface-deep p-4 space-y-2">
          <Label>Soul File</Label>
          <p className="text-[11px] text-muted-foreground">
            Markdown instructions defining the agent's personality, tone, and behavioral rules.
            Leave empty for platform default.
          </p>
          <Textarea
            value={soulFile}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { setSoulFile(e.target.value); markDirty(); }}
            placeholder="Leave empty to use the platform default soul file..."
            className="font-mono text-xs min-h-[250px]"
          />
        </div>
      </div>
    </div>
  );
}
