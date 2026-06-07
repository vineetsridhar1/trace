import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { gql } from "@urql/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { START_SESSION_MUTATION, useEntityField, useEntityStore } from "@trace/client-core";
import type { GitCheckpoint, HostingMode, Repo } from "@trace/gql";
import { shortSha } from "@trace/shared";
import { Button, ListRow, SegmentedControl, Text, TraceLoader } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";

const SESSION_GROUP_FILES_QUERY = gql`
  query MobileSessionGroupFiles($sessionGroupId: ID!) {
    sessionGroupFiles(sessionGroupId: $sessionGroupId)
  }
`;

const SESSION_GROUP_FILE_CONTENT_QUERY = gql`
  query MobileSessionGroupFileContent($sessionGroupId: ID!, $filePath: String!) {
    sessionGroupFileContentWithSource(sessionGroupId: $sessionGroupId, filePath: $filePath) {
      content
      ref
      usedFallback
    }
  }
`;

const SESSION_GROUP_BRANCH_DIFF_QUERY = gql`
  query MobileSessionGroupBranchDiff($sessionGroupId: ID!) {
    sessionGroupBranchDiff(sessionGroupId: $sessionGroupId) {
      path
      status
      additions
      deletions
    }
  }
`;

type WorkspaceTab = "files" | "changes" | "checkpoints";
type FilesData = { sessionGroupFiles?: string[] | null };
type FileContentData = {
  sessionGroupFileContentWithSource?: {
    content: string;
    ref: string;
    usedFallback: boolean;
  } | null;
};
type BranchDiffFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
};
type DiffData = { sessionGroupBranchDiff?: BranchDiffFile[] | null };
type StartSessionData = { startSession?: { id: string; sessionGroupId: string } | null };

const TABS: WorkspaceTab[] = ["files", "changes", "checkpoints"];
const TAB_LABELS = ["Files", "Changes", "Checkpoints"];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function WorkspacePanelSheetContent({
  groupId,
  sessionId,
}: {
  groupId: string;
  sessionId?: string | null;
}) {
  const [tab, setTab] = useState<WorkspaceTab>("files");
  const selectedIndex = TABS.indexOf(tab);
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="headline">Workspace</Text>
        <SegmentedControl
          segments={TAB_LABELS}
          selectedIndex={selectedIndex}
          onChange={(index) => setTab(TABS[index] ?? "files")}
        />
      </View>
      {tab === "files" ? (
        <FilesTab groupId={groupId} />
      ) : tab === "changes" ? (
        <ChangesTab groupId={groupId} />
      ) : (
        <CheckpointsTab groupId={groupId} sessionId={sessionId ?? null} />
      )}
    </View>
  );
}

function FilesTab({ groupId }: { groupId: string }) {
  const theme = useTheme();
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getClient()
        .query<FilesData>(SESSION_GROUP_FILES_QUERY, { sessionGroupId: groupId })
        .toPromise();
      if (result.error) throw result.error;
      setFiles(result.data?.sessionGroupFiles ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load files.");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  async function openFile(filePath: string) {
    setSelectedFile(filePath);
    setContent(null);
    setContentLoading(true);
    try {
      const result = await getClient()
        .query<FileContentData>(
          SESSION_GROUP_FILE_CONTENT_QUERY,
          { sessionGroupId: groupId, filePath },
          { requestPolicy: "network-only" },
        )
        .toPromise();
      if (result.error) throw result.error;
      setContent(result.data?.sessionGroupFileContentWithSource?.content ?? "");
    } catch (loadError) {
      Alert.alert(
        "Couldn't open file",
        loadError instanceof Error ? loadError.message : "Try again.",
      );
      setSelectedFile(null);
    } finally {
      setContentLoading(false);
    }
  }

  if (selectedFile) {
    return (
      <View style={styles.panel}>
        <ListRow
          title={selectedFile}
          subtitle="Preview"
          leading={
            <SymbolView name="chevron.left" size={16} tintColor={theme.colors.mutedForeground} />
          }
          onPress={() => setSelectedFile(null)}
          separator
        />
        {contentLoading ? (
          <LoadingState label="Loading file..." />
        ) : (
          <ScrollView style={styles.preview} contentContainerStyle={styles.previewContent}>
            <Text variant="caption1" color="mutedForeground" style={styles.monospace}>
              {content}
            </Text>
          </ScrollView>
        )}
      </View>
    );
  }

  if (loading) return <LoadingState label="Loading files..." />;
  if (error) return <ErrorState message={error} onRetry={loadFiles} />;
  if (files.length === 0) return <EmptyState label="No files available" />;

  return (
    <ScrollView style={styles.panel}>
      {files.map((file, index) => (
        <ListRow
          key={file}
          title={file.split("/").pop() ?? file}
          subtitle={file}
          leading={<SymbolView name="doc.text" size={16} tintColor={theme.colors.mutedForeground} />}
          onPress={() => void openFile(file)}
          separator={index < files.length - 1}
        />
      ))}
    </ScrollView>
  );
}

function ChangesTab({ groupId }: { groupId: string }) {
  const theme = useTheme();
  const [files, setFiles] = useState<BranchDiffFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadChanges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getClient()
        .query<DiffData>(SESSION_GROUP_BRANCH_DIFF_QUERY, { sessionGroupId: groupId })
        .toPromise();
      if (result.error) throw result.error;
      setFiles(result.data?.sessionGroupBranchDiff ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load changes.");
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void loadChanges();
  }, [loadChanges]);

  if (loading) return <LoadingState label="Loading changes..." />;
  if (error) return <ErrorState message={error} onRetry={loadChanges} />;
  if (files.length === 0) return <EmptyState label="No changes on this branch" />;

  return (
    <ScrollView style={styles.panel}>
      {files.map((file, index) => (
        <ListRow
          key={file.path}
          title={file.path.split("/").pop() ?? file.path}
          subtitle={`${file.status}  +${file.additions} -${file.deletions}  ${file.path}`}
          leading={
            <SymbolView
              name={file.status === "deleted" ? "minus.circle" : "plus.forwardslash.minus"}
              size={16}
              tintColor={file.status === "deleted" ? theme.colors.destructive : theme.colors.success}
            />
          }
          separator={index < files.length - 1}
        />
      ))}
    </ScrollView>
  );
}

function CheckpointsTab({
  groupId,
  sessionId,
}: {
  groupId: string;
  sessionId: string | null;
}) {
  const theme = useTheme();
  const router = useRouter();
  const gitCheckpoints = useEntityField("sessionGroups", groupId, "gitCheckpoints") as
    | GitCheckpoint[]
    | undefined;
  const session = useEntityStore((state) => (sessionId ? state.sessions[sessionId] : undefined));
  const group = useEntityStore((state) => state.sessionGroups[groupId]);
  const checkpoints = useMemo(() => {
    return [...(gitCheckpoints ?? [])].sort((a, b) => b.committedAt.localeCompare(a.committedAt));
  }, [gitCheckpoints]);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function restoreCheckpoint(checkpoint: GitCheckpoint) {
    if (!session) {
      Alert.alert("Select a session first", "Open a session in this workspace before restoring.");
      return;
    }
    setRestoringId(checkpoint.id);
    try {
      const repo = session.repo as Repo | null | undefined;
      const channelId =
        group?.channel?.id ?? (group as { channelId?: string | null } | undefined)?.channelId;
      const result = await getClient()
        .mutation<StartSessionData>(START_SESSION_MUTATION, {
          input: {
            tool: session.tool,
            model: session.model ?? undefined,
            reasoningEffort: session.reasoningEffort ?? undefined,
            hosting: session.hosting as HostingMode,
            channelId: channelId ?? undefined,
            repoId: repo?.id ?? undefined,
            restoreCheckpointId: checkpoint.id,
          },
        })
        .toPromise();
      if (result.error) throw result.error;
      const next = result.data?.startSession;
      if (!next?.id || !next.sessionGroupId) throw new Error("No restored session returned.");
      void haptic.success();
      router.replace(`/sessions/${next.sessionGroupId}/${next.id}`);
    } catch (error) {
      void haptic.error();
      Alert.alert("Couldn't restore checkpoint", error instanceof Error ? error.message : "Try again.");
    } finally {
      setRestoringId(null);
    }
  }

  if (checkpoints.length === 0) return <EmptyState label="No checkpoints yet" />;

  return (
    <ScrollView style={styles.panel}>
      {checkpoints.map((checkpoint, index) => (
        <View
          key={checkpoint.id}
          style={[
            styles.checkpointRow,
            {
              borderBottomWidth: index < checkpoints.length - 1 ? StyleSheet.hairlineWidth : 0,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.checkpointText}>
            <Text variant="body" numberOfLines={1}>
              {checkpoint.subject || "Checkpoint"}
            </Text>
            <Text variant="footnote" color="mutedForeground" numberOfLines={1}>
              {shortSha(checkpoint.commitSha)} · {checkpoint.filesChanged} files ·{" "}
              {formatDate(checkpoint.committedAt)}
            </Text>
          </View>
          <Button
            title="Restore"
            size="sm"
            variant="secondary"
            loading={restoringId === checkpoint.id}
            disabled={restoringId !== null}
            onPress={() => void restoreCheckpoint(checkpoint)}
          />
        </View>
      ))}
    </ScrollView>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <View style={styles.centerState}>
      <TraceLoader size="small" color="mutedForeground" />
      <Text variant="footnote" color="mutedForeground">
        {label}
      </Text>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void | Promise<void> }) {
  return (
    <View style={styles.centerState}>
      <Text variant="footnote" color="destructive" align="center">
        {message}
      </Text>
      <Pressable accessibilityRole="button" onPress={() => void onRetry()} style={styles.retry}>
        <Text variant="footnote" color="accent">
          Retry
        </Text>
      </Pressable>
    </View>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <View style={styles.centerState}>
      <Text variant="footnote" color="mutedForeground">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 520,
  },
  header: {
    gap: 14,
    padding: 16,
    paddingBottom: 12,
  },
  panel: {
    flex: 1,
  },
  centerState: {
    flex: 1,
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
  },
  retry: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  preview: {
    flex: 1,
  },
  previewContent: {
    padding: 16,
  },
  monospace: {
    fontFamily: "SpaceMono",
  },
  checkpointRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  checkpointText: {
    flex: 1,
    minWidth: 0,
  },
});
