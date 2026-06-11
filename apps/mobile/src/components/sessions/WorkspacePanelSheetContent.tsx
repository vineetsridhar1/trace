import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { gql } from "@urql/core";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Glass, ListRow, Text, TraceLoader } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";
import { alpha } from "@/theme/colors";

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

type WorkspaceTab = "files" | "changes";
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
type FileTreeNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
};

type VisibleFileTreeNode = FileTreeNode & { depth: number };
type VisibleBranchChangeTreeNode = VisibleFileTreeNode & { file?: BranchDiffFile };

const HEADER_BLUR_INTENSITY = 3;
const HEADER_FADE_EXTRA_HEIGHT = 56;

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

function directoryPathsFromTree(tree: FileTreeNode[]): Set<string> {
  const paths = new Set<string>();
  const visit = (node: FileTreeNode) => {
    if (!node.isDirectory) return;
    paths.add(node.path);
    for (const child of node.children) visit(child);
  };

  for (const node of tree) visit(node);
  return paths;
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

function branchChangeColor(status: string, theme: ReturnType<typeof useTheme>): string {
  switch (status) {
    case "A":
    case "added":
      return theme.colors.success;
    case "D":
    case "deleted":
      return theme.colors.destructive;
    case "R":
    case "C":
    case "renamed":
    case "copied":
      return theme.colors.accent;
    case "M":
    case "modified":
      return theme.colors.warning;
    default:
      return theme.colors.mutedForeground;
  }
}

export function WorkspacePanelSheetContent({
  groupId,
}: {
  groupId: string;
  sessionId?: string | null;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<WorkspaceTab>("files");
  const showingFiles = tab === "files";
  const topInset = insets.top + theme.spacing.sm;
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.workspaceBody}>
        {showingFiles ? (
          <FilesTab groupId={groupId} topInset={topInset} />
        ) : (
          <ChangesTab groupId={groupId} topInset={topInset} />
        )}
      </View>
      <BlurView
        pointerEvents="none"
        tint={theme.scheme === "dark" ? "systemThinMaterialDark" : "systemThinMaterial"}
        intensity={HEADER_BLUR_INTENSITY}
        style={[styles.topBlur, { height: topInset - 8 }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[
          alpha(theme.colors.background, 1),
          alpha(theme.colors.background, 0.48),
          alpha(theme.colors.background, 0),
        ]}
        locations={[0, 0.68, 1]}
        style={[styles.topFade, { height: topInset + HEADER_FADE_EXTRA_HEIGHT }]}
      />
      <WorkspaceModeFab mode={tab} bottomInset={insets.bottom} onChange={setTab} />
    </View>
  );
}

function WorkspaceModeFab({
  mode,
  bottomInset,
  onChange,
}: {
  mode: WorkspaceTab;
  bottomInset: number;
  onChange: (mode: WorkspaceTab) => void;
}) {
  const theme = useTheme();
  const nextMode: WorkspaceTab = mode === "files" ? "changes" : "files";
  const label = mode === "files" ? "Changes" : "Files";
  const icon: SFSymbol = mode === "files" ? "plus.forwardslash.minus" : "folder";

  return (
    <View
      style={[
        styles.fabWrap,
        { right: theme.spacing.lg, bottom: bottomInset + theme.spacing.lg },
      ]}
    >
      <Glass preset="pinnedBar" glassStyleEffect="clear" interactive style={styles.fabGlass}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Show ${label}`}
          onPress={() => {
            void haptic.selection();
            onChange(nextMode);
          }}
          style={({ pressed }) => [styles.fabButton, { opacity: pressed ? 0.72 : 1 }]}
        >
          <SymbolView
            name={icon}
            size={16}
            tintColor={theme.colors.foreground}
            resizeMode="scaleAspectFit"
            style={styles.fabIcon}
          />
          <Text variant="footnote" color="foreground">
            {label}
          </Text>
        </Pressable>
      </Glass>
    </View>
  );
}

function FilesTab({ groupId, topInset }: { groupId: string; topInset: number }) {
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
      <View
        style={[
          styles.explorerCard,
          {
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        <FlatList
          data={visibleFiles}
          keyExtractor={(node) => `${node.isDirectory ? "d" : "f"}:${node.path}`}
          initialNumToRender={32}
          maxToRenderPerBatch={32}
          windowSize={9}
          removeClippedSubviews
          contentContainerStyle={{ paddingTop: topInset }}
          scrollIndicatorInsets={{ top: topInset }}
          ItemSeparatorComponent={() => (
            <View style={[styles.fileTreeSeparator, { backgroundColor: theme.colors.border }]} />
          )}
          renderItem={({ item: node }) => (
            <FileTreeRow
              node={node}
              expanded={expandedPaths.has(node.path)}
              onToggle={toggleDirectory}
              onOpenFile={(path) => void openFile(path)}
            />
          )}
        />
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
          paddingLeft: 12 + node.depth * 18,
          backgroundColor: pressed ? alpha(theme.colors.accent, 0.08) : "transparent",
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
      <View
        style={[
          styles.fileTreeIconBubble,
          {
            backgroundColor: node.isDirectory
              ? alpha(theme.colors.accent, 0.14)
              : alpha(theme.colors.foreground, 0.06),
            borderRadius: theme.radius.sm,
          },
        ]}
      >
        <SymbolView
          name={icon}
          size={15}
          tintColor={iconColor}
          resizeMode="scaleAspectFit"
          style={styles.fileTreeIcon}
        />
      </View>
      <View style={styles.fileTreeText}>
        <Text variant="body" color="foreground" numberOfLines={1} style={styles.fileTreeName}>
          {node.name}
        </Text>
        {!node.isDirectory && node.depth > 0 ? (
          <Text variant="caption2" color="dimForeground" numberOfLines={1}>
            {node.path.split("/").slice(0, -1).join("/")}
          </Text>
        ) : null}
      </View>
      {!node.isDirectory ? (
        <SymbolView
          name="chevron.right"
          size={12}
          tintColor={theme.colors.dimForeground}
          resizeMode="scaleAspectFit"
        />
      ) : null}
    </Pressable>
  );
}

function ChangesTab({ groupId, topInset }: { groupId: string; topInset: number }) {
  const theme = useTheme();
  const [files, setFiles] = useState<BranchDiffFile[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tree = useMemo(() => buildFileTree(files.map((file) => file.path)), [files]);
  const fileByPath = useMemo(
    () => new Map(files.map((file) => [file.path, file] as const)),
    [files],
  );
  const visibleFiles = useMemo<VisibleBranchChangeTreeNode[]>(() => {
    return flattenFileTree(tree, expandedPaths).map((node) => ({
      ...node,
      file: node.isDirectory ? undefined : fileByPath.get(node.path),
    }));
  }, [expandedPaths, fileByPath, tree]);

  useEffect(() => {
    setExpandedPaths(directoryPathsFromTree(tree));
  }, [tree]);

  const toggleDirectory = useCallback((path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

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
    <FlatList
      data={visibleFiles}
      keyExtractor={(node) => `${node.isDirectory ? "d" : "f"}:${node.path}`}
      initialNumToRender={32}
      maxToRenderPerBatch={32}
      windowSize={9}
      removeClippedSubviews
      contentContainerStyle={{ paddingTop: topInset }}
      scrollIndicatorInsets={{ top: topInset }}
      ItemSeparatorComponent={() => (
        <View style={[styles.fileTreeSeparator, { backgroundColor: theme.colors.border }]} />
      )}
      renderItem={({ item: node }) => (
        <BranchChangeTreeRow
          node={node}
          expanded={expandedPaths.has(node.path)}
          onToggle={toggleDirectory}
        />
      )}
    />
  );
}

function BranchChangeTreeRow({
  node,
  expanded,
  onToggle,
}: {
  node: VisibleBranchChangeTreeNode;
  expanded: boolean;
  onToggle: (path: string) => void;
}) {
  const theme = useTheme();
  const file = node.file;
  const changeColor = file ? branchChangeColor(file.status, theme) : theme.colors.accent;
  const icon: SFSymbol = node.isDirectory
    ? expanded
      ? "folder.fill"
      : "folder"
    : fileSymbol(node.name);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={node.path}
      onPress={() => {
        if (node.isDirectory) onToggle(node.path);
      }}
      style={({ pressed }) => [
        styles.fileTreeRow,
        {
          paddingLeft: 12 + node.depth * 18,
          backgroundColor: pressed ? alpha(changeColor, 0.08) : "transparent",
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
      <View
        style={[
          styles.fileTreeIconBubble,
          {
            backgroundColor: node.isDirectory
              ? alpha(theme.colors.accent, 0.14)
              : alpha(changeColor, 0.12),
            borderRadius: theme.radius.sm,
          },
        ]}
      >
        <SymbolView
          name={icon}
          size={15}
          tintColor={node.isDirectory ? theme.colors.accent : changeColor}
          resizeMode="scaleAspectFit"
          style={styles.fileTreeIcon}
        />
      </View>
      <View style={styles.fileTreeText}>
        <Text variant="body" color="foreground" numberOfLines={1} style={styles.fileTreeName}>
          {node.name}
        </Text>
        {!node.isDirectory && node.depth > 0 ? (
          <Text variant="caption2" color="dimForeground" numberOfLines={1}>
            {node.path.split("/").slice(0, -1).join("/")}
          </Text>
        ) : null}
      </View>
      {file ? <BranchChangeStats file={file} color={changeColor} /> : null}
    </Pressable>
  );
}

function BranchChangeStats({ file, color }: { file: BranchDiffFile; color: string }) {
  const theme = useTheme();
  return (
    <View style={styles.changeStats}>
      <View style={[styles.changeStatusDot, { backgroundColor: color }]} />
      {file.additions > 0 ? (
        <Text variant="caption2" style={[styles.changeStatText, { color: theme.colors.success }]}>
          +{file.additions}
        </Text>
      ) : null}
      {file.deletions > 0 ? (
        <Text
          variant="caption2"
          style={[styles.changeStatText, { color: theme.colors.destructive }]}
        >
          -{file.deletions}
        </Text>
      ) : null}
    </View>
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
  },
  workspaceBody: {
    flex: 1,
  },
  topFade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9,
  },
  topBlur: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 8,
  },
  panel: {
    flex: 1,
  },
  fabWrap: {
    position: "absolute",
    zIndex: 10,
  },
  fabGlass: {
    borderRadius: 9999,
  },
  fabButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
  },
  fabIcon: {
    width: 16,
    height: 16,
  },
  explorerShell: {
    flex: 1,
  },
  explorerCard: {
    flex: 1,
    overflow: "hidden",
  },
  fileTreeSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 58,
    opacity: 0.55,
  },
  fileTreeRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 12,
  },
  fileTreeChevron: {
    width: 16,
    height: 16,
  },
  fileTreeIconBubble: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  fileTreeIcon: {
    width: 16,
    height: 16,
  },
  fileTreeText: {
    flex: 1,
    minWidth: 0,
  },
  fileTreeName: {
    lineHeight: 21,
  },
  changeStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 8,
  },
  changeStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  changeStatText: {
    fontFamily: "SpaceMono",
    lineHeight: 16,
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
});
