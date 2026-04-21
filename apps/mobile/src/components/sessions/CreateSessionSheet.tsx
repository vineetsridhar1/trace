import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useEntityField } from "@trace/client-core";
import { getDefaultModel } from "@trace/shared";
import type { CodingTool } from "@trace/gql";
import { Button, SegmentedControl, Text } from "@/components/design-system";
import { CreateSessionModelList } from "./CreateSessionModelList";
import { CreateSessionRuntimeList } from "./CreateSessionRuntimeList";
import {
  CLOUD_RUNTIME_ID,
  useAvailableRuntimes,
  useCreateSession,
} from "@/hooks/useCreateSession";
import { useTheme } from "@/theme";

const TOOL_VALUES: readonly CodingTool[] = ["claude_code", "codex"];
const TOOL_LABELS = ["Claude Code", "Codex"];

export interface CreateSessionSheetProps {
  channelId: string;
}

export function CreateSessionSheet({ channelId }: CreateSessionSheetProps) {
  const theme = useTheme();
  const router = useRouter();
  const channelName = useEntityField("channels", channelId, "name");
  const channelRepo = useEntityField("channels", channelId, "repo");
  const channelRepoId = channelRepo?.id;

  const [tool, setTool] = useState<CodingTool>("claude_code");
  const [model, setModel] = useState<string | undefined>(() =>
    getDefaultModel("claude_code"),
  );
  const [runtimeId, setRuntimeId] = useState<string>(CLOUD_RUNTIME_ID);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { runtimes, loading: runtimesLoading } = useAvailableRuntimes(tool);
  const { createSession, submitting } = useCreateSession();

  // Re-default the model whenever the tool changes so we never ship an
  // incompatible pair (e.g. Codex tool + Sonnet model).
  useEffect(() => {
    setModel(getDefaultModel(tool));
  }, [tool]);

  // Auto-pick a single eligible connected local bridge once runtimes load,
  // mirroring web's `resolveDefaultRuntime`. The user can still switch back.
  useEffect(() => {
    if (runtimesLoading) return;
    if (runtimeId !== CLOUD_RUNTIME_ID) return;
    const eligible = runtimes.filter(
      (r) =>
        r.connected
        && r.hostingMode === "local"
        && (!channelRepoId || r.registeredRepoIds.includes(channelRepoId)),
    );
    if (eligible.length === 1) setRuntimeId(eligible[0].id);
  }, [runtimesLoading, runtimes, runtimeId, channelRepoId]);

  const toolIndex = TOOL_VALUES.indexOf(tool);

  async function handleSubmit() {
    setError(null);
    try {
      const { sessionGroupId } = await createSession({
        tool,
        model,
        runtimeId,
        channelId,
        repoId: channelRepoId,
        prompt,
      });
      router.back();
      router.push(`/sessions/${sessionGroupId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    }
  }

  const submitDisabled = useMemo(() => {
    if (submitting) return true;
    if (runtimeId !== CLOUD_RUNTIME_ID) {
      const rt = runtimes.find((r) => r.id === runtimeId);
      if (!rt || !rt.connected) return true;
      if (
        channelRepoId
        && rt.hostingMode === "local"
        && !rt.registeredRepoIds.includes(channelRepoId)
      ) {
        return true;
      }
    }
    return false;
  }, [submitting, runtimeId, runtimes, channelRepoId]);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text variant="title2">New session</Text>
          {channelName ? (
            <Text variant="footnote" color="mutedForeground">
              in {channelName}
            </Text>
          ) : null}
        </View>

        <SegmentedControl
          segments={TOOL_LABELS}
          selectedIndex={Math.max(0, toolIndex)}
          onChange={(i: number) => {
            const next = TOOL_VALUES[i];
            if (next) setTool(next);
          }}
        />

        <Section title="Model">
          <CreateSessionModelList
            tool={tool}
            selectedModel={model}
            onSelect={setModel}
          />
        </Section>

        <Section title="Runtime">
          <CreateSessionRuntimeList
            runtimes={runtimes}
            loading={runtimesLoading}
            selectedRuntimeId={runtimeId}
            channelRepoId={channelRepoId ?? undefined}
            onSelect={setRuntimeId}
          />
        </Section>

        <Section title="Initial prompt (optional)">
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Tell the agent what to do…"
            placeholderTextColor={theme.colors.dimForeground}
            multiline
            style={[
              styles.textInput,
              {
                backgroundColor: theme.colors.surfaceElevated,
                borderColor: theme.colors.borderMuted,
                borderRadius: theme.radius.lg,
                color: theme.colors.foreground,
              },
            ]}
          />
        </Section>

        {error ? (
          <Text variant="footnote" color="destructive">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Start session"
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitDisabled}
        />
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="footnote" color="mutedForeground">
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    gap: 20,
    paddingBottom: 16,
  },
  header: {
    gap: 4,
  },
  section: {
    gap: 8,
  },
  textInput: {
    minHeight: 96,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 22,
    borderWidth: StyleSheet.hairlineWidth,
    textAlignVertical: "top",
  },
  footer: {
    paddingTop: 12,
  },
});
