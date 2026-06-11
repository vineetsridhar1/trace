import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { gql } from "@urql/core";
import { useRouter } from "expo-router";
import { SymbolView, type SFSymbol } from "expo-symbols";
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

type FileTreeNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
};

type VisibleFileTreeNode = FileTreeNode & { depth: number };

const TABS: WorkspaceTab[] = ["files", "changes", "checkpoints"];
const TAB_LABELS = ["Files", "Changes", "Checkpoints"];

function buildFileTree(files: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const nodeMap = new Map<string, FileTreeNode>();

  for (const filePath of files) {
    const parts = filePath.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const nodePath = parts.slice(0, i + 1).join("/");
      const key = `${isLast ? "f" : "d"}:${nodePath}`;
      let node = nodeMap.get(key);
      if (!node) {
        node = { name, path: nodePath, isDirectory: !isLast, children: [] };
        nodeMap.set(key, node);
        current.push(node);
      }
      current = node.children;
    }
  }

  const sortNodes = (nodes: FileTreeNode[]) => {
    for (const node of nodes) sortNodes(node.children);
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  };
  sortNodes(root);
  return root;
}

function flattenFileTree(
  nodes: FileTreeNode[],
  expandedPaths: Set<string>,
  depth = 0,
): VisibleFileTreeNode[] {
  const visible: VisibleFileTreeNode[] = [];
  for (const node of nodes) {
    visible.push({ ...node, depth });
    if (node.isDirectory && expandedPaths.has(node.path)) {
      visible.push(...flattenFileTree(node.children, expandedPaths, depth + 1));
    }
  }
  return visible;
}

function countTreeNodes(nodes: FileTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1 + countTreeNodes(node.children);
  }
  return count;
}

function initialExpandedPaths(tree: FileTreeNode[]): Set<string> {
  const expanded = new Set<string>();
  for (const node of tree) {
    if (!node.isDirectory) continue;
    expanded.add(node.path);
    let current = node;
    while (current.children.length === 1 && current.children[0]?.isDirectory) {
      current = current.children[0];
      expanded.add(current.path);
    }
  }
  return expanded;
}

function fileSymbol(path: string): SFSymbol {
  const ext = path.split(".").pop()?.toLowerCase();
  if (["ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "css", "html"].includes(ext ?? "")) {
    return "curlybraces";
  }
  if (["json", "jsonc", "yaml", "yml", "toml"].includes(ext ?? "")) return "gearshape";
  if (["md", "mdx", "txt"].includes(ext ?? "")) return "doc.text";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext ?? "")) return "photo";
  return "doc";
}

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
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const didAutoExpandRef = useRef(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tree = useMemo(() => buildFileTree(files), [files]);
  const visibleFiles = useMemo(() => flattenFileTree(tree, expandedPaths), [expandedPaths, tree]);
  const treeItemCount = useMemo(() => countTreeNodes(tree), [tree]);

  useEffect(() => {
    if (tree.length === 0) {
      didAutoExpandRef.current = false;
      setExpandedPaths(new Set());
      return;
    }
    if (didAutoExpandRef.current) return;
    setExpandedPaths(initialExpandedPaths(tree));
    didAutoExpandRef.current = true;
  }, [tree]);

  const toggleDirectory = useCallback((path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getClient()
        .query<FilesData>(SESSION_GROUP_FILES_QUERY, { sessionGroupId: groupId })
        .toPromise();
      if (result.error) throw result.error;
      didAutoExpandRef.current = false;
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

  const openFile = useCallback(
    async (filePath: string) => {
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
    },
    [groupId],
  );

  const closeFile = useCallback(() => {
    setContent(null);
    setContentLoading(false);
    setSelectedFile(null);
  }, []);

  if (selectedFile) {
    return (
      <View style={styles.panel}>
        <ListRow
          title={selectedFile}
          subtitle="Preview"
          leading={
            <SymbolView name="chevron.left" size={16} tintColor={theme.colors.mutedForeground} />
          }
          onPress={closeFile}
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
    <View style={styles.explorerShell}>
      <View style={styles.explorerHeader}>
        <Text variant="caption2" color="mutedForeground" style={styles.explorerTitle}>
          EXPLORER
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh files"
          onPress={() => void loadFiles()}
          style={({ pressed }) => [styles.explorerRefresh, { opacity: pressed ? 0.6 : 1 }]}
        >
          <SymbolView
            name="arrow.clockwise"
            size={12}
            tintColor={theme.colors.mutedForeground}
            resizeMode="scaleAspectFit"
          />
        </Pressable>
      </View>
      <FlatList
        style={styles.explorerList}
        data={visibleFiles}
        keyExtractor={(node) => `${node.isDirectory ? "d" : "f"}:${node.path}`}
        initialNumToRender={40}
        maxToRenderPerBatch={40}
        windowSize={9}
        removeClippedSubviews
        renderItem={({ item: node }) => (
          <FileTreeRow
            node={node}
            expanded={expandedPaths.has(node.path)}
            onToggle={toggleDirectory}
            onOpenFile={(path) => void openFile(path)}
          />
        )}
      />
      <View style={styles.explorerFooter}>
        <Text variant="caption2" color="dimForeground">
          {treeItemCount} item{treeItemCount === 1 ? "" : "s"} loaded
        </Text>
      </View>
    </View>
  );
}

function FileTreeRow({
  node,
  expanded,
  onToggle,
  onOpenFile,
}: {
  node: VisibleFileTreeNode;
  expanded: boolean;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const theme = useTheme();
  const icon: SFSymbol = node.isDirectory
    ? expanded
      ? "folder.fill"
      : "folder"
    : fileSymbol(node.name);
  const iconColor = node.isDirectory ? theme.colors.accent : theme.colors.mutedForeground;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={node.path}
      onPress={() => {
        if (node.isDirectory) onToggle(node.path);
        else onOpenFile(node.path);
      }}
      style={({ pressed }) => [
        styles.fileTreeRow,
        {
          paddingLeft: 6 + node.depth * 12,
          backgroundColor: pressed ? theme.colors.surfaceElevated : "transparent",
        },
      ]}
    >
      {node.isDirectory ? (
        <SymbolView
          name={expanded ? "chevron.down" : "chevron.right"}
          size={12}
          tintColor={theme.colors.dimForeground}
          resizeMode="scaleAspectFit"
          style={styles.fileTreeChevron}
        />
      ) : (
        <View style={styles.fileTreeChevron} />
      )}
      <SymbolView
        name={icon}
        size={15}
        tintColor={iconColor}
        resizeMode="scaleAspectFit"
        style={styles.fileTreeIcon}
      />
      <Text variant="caption1" color="foreground" numberOfLines={1} style={styles.fileTreeName}>
        {node.name}
      </Text>
    </Pressable>
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
  explorerShell: {
    flex: 1,
    backgroundColor: "#1e1e1e",
  },
  explorerHeader: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2d2d2d",
    paddingHorizontal: 12,
  },
  explorerTitle: {
    letterSpacing: 0.8,
    fontWeight: "700",
    color: "#bbbbbb",
  },
  explorerRefresh: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  explorerList: {
    flex: 1,
    paddingVertical: 2,
  },
  explorerFooter: {
    minHeight: 28,
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#2d2d2d",
    paddingHorizontal: 12,
  },
  fileTreeRow: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: 8,
  },
  fileTreeChevron: {
    width: 16,
    height: 16,
  },
  fileTreeIcon: {
    width: 16,
    height: 16,
  },
  fileTreeName: {
    flex: 1,
    color: "#cccccc",
    lineHeight: 22,
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
