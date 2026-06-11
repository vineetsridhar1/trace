import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { gql } from "@urql/core";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { MaterialCommunityIcons } from "@expo/vector-icons";
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

const SESSION_GROUP_DEFAULT_BRANCH_QUERY = gql`
  query MobileSessionGroupDefaultBranch($id: ID!) {
    sessionGroup(id: $id) {
      id
      repo {
        id
        defaultBranch
      }
    }
  }
`;

const SESSION_GROUP_FILE_AT_REF_QUERY = gql`
  query MobileSessionGroupFileAtRef($sessionGroupId: ID!, $filePath: String!, $ref: String!) {
    sessionGroupFileAtRef(sessionGroupId: $sessionGroupId, filePath: $filePath, ref: $ref)
  }
`;

const SESSION_GROUP_FILE_CONTENT_FOR_DIFF_QUERY = gql`
  query MobileSessionGroupFileContentForDiff($sessionGroupId: ID!, $filePath: String!) {
    sessionGroupFileContent(sessionGroupId: $sessionGroupId, filePath: $filePath)
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
type DefaultBranchData = {
  sessionGroup?: {
    repo?: {
      defaultBranch: string;
    } | null;
  } | null;
};
type FileAtRefData = { sessionGroupFileAtRef?: string | null };
type FileContentForDiffData = { sessionGroupFileContent?: string | null };
type FileIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
type FileTreeNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
};

type VisibleFileTreeNode = FileTreeNode & { depth: number };
type VisibleBranchChangeTreeNode = VisibleFileTreeNode & { file?: BranchDiffFile };
type DiffLineType = "context" | "added" | "removed";
type DiffLine = {
  id: string;
  type: DiffLineType;
  oldLineNumber?: number;
  newLineNumber?: number;
  text: string;
};
type HighlightKind =
  | "plain"
  | "comment"
  | "string"
  | "keyword"
  | "number"
  | "symbol"
  | "punctuation";
type HighlightPart = { text: string; kind: HighlightKind };

const HEADER_BLUR_INTENSITY = 3;
const HEADER_FADE_EXTRA_HEIGHT = 56;
const CODE_TOKEN_PATTERN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:import|from|export|default|function|return|const|let|var|if|else|for|while|class|interface|type|extends|async|await|try|catch|throw|new|true|false|null|undefined)\b|\b[A-Z][A-Za-z0-9_]*\b|\b\d+(?:\.\d+)?\b|[{}()[\]<>/=:+\-*.,;?])/g;
const FILE_ICON_BY_BASENAME: Record<string, { name: string; color: string }> = {
  ".gitignore": { name: "git", color: "#f05032" },
  ".npmrc": { name: "npm", color: "#cb3837" },
  "docker-compose.yml": { name: "docker", color: "#2496ed" },
  "docker-compose.yaml": { name: "docker", color: "#2496ed" },
  dockerfile: { name: "docker", color: "#2496ed" },
  "package-lock.json": { name: "npm", color: "#cb3837" },
  "package.json": { name: "npm", color: "#cb3837" },
  "pnpm-lock.yaml": { name: "npm", color: "#f69220" },
  "yarn.lock": { name: "npm", color: "#2c8ebb" },
};
const FILE_ICON_BY_EXTENSION: Record<string, { name: string; color: string }> = {
  c: { name: "language-c", color: "#a8b9cc" },
  cc: { name: "language-cpp", color: "#659ad2" },
  cpp: { name: "language-cpp", color: "#659ad2" },
  cs: { name: "language-csharp", color: "#68217a" },
  css: { name: "language-css3", color: "#1572b6" },
  go: { name: "language-go", color: "#00add8" },
  html: { name: "language-html5", color: "#e34f26" },
  java: { name: "language-java", color: "#f89820" },
  jpeg: { name: "file-image-outline", color: "#a78bfa" },
  jpg: { name: "file-image-outline", color: "#a78bfa" },
  js: { name: "language-javascript", color: "#f7df1e" },
  json: { name: "code-json", color: "#f7df1e" },
  jsx: { name: "react", color: "#61dafb" },
  kt: { name: "language-kotlin", color: "#7f52ff" },
  less: { name: "language-css3", color: "#1d365d" },
  md: { name: "language-markdown", color: "#a1a1aa" },
  mdx: { name: "language-markdown", color: "#a1a1aa" },
  php: { name: "language-php", color: "#777bb4" },
  png: { name: "file-image-outline", color: "#a78bfa" },
  py: { name: "language-python", color: "#3776ab" },
  rb: { name: "language-ruby", color: "#cc342d" },
  rs: { name: "language-rust", color: "#dea584" },
  sass: { name: "sass", color: "#cc6699" },
  scss: { name: "sass", color: "#cc6699" },
  swift: { name: "language-swift", color: "#f05138" },
  svg: { name: "file-image-outline", color: "#ffb13b" },
  ts: { name: "language-typescript", color: "#3178c6" },
  tsx: { name: "react", color: "#61dafb" },
  vue: { name: "vuejs", color: "#42b883" },
  webp: { name: "file-image-outline", color: "#a78bfa" },
  xml: { name: "file-xml-box", color: "#f97316" },
};

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
  if (
    ["ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "css", "html"].includes(ext ?? "")
  ) {
    return "curlybraces";
  }
  if (["json", "jsonc", "yaml", "yml", "toml"].includes(ext ?? "")) return "gearshape";
  if (["md", "mdx", "txt"].includes(ext ?? "")) return "doc.text";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext ?? "")) return "photo";
  return "doc";
}

function fileIconForPath(path: string): { name: FileIconName; color: string } | null {
  const basename = path.split("/").pop()?.toLowerCase();
  const basenameIcon = basename ? FILE_ICON_BY_BASENAME[basename] : undefined;
  if (basenameIcon) return { name: basenameIcon.name as FileIconName, color: basenameIcon.color };

  const ext = path.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  const icon = FILE_ICON_BY_EXTENSION[ext];
  if (!icon) return null;
  return { name: icon.name as FileIconName, color: icon.color };
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

function isAddedStatus(status: string): boolean {
  return status === "A" || status === "added";
}

function isDeletedStatus(status: string): boolean {
  return status === "D" || status === "deleted";
}

function splitLines(content: string): string[] {
  if (content.length === 0) return [];
  const withoutTrailingNewline = content.endsWith("\n") ? content.slice(0, -1) : content;
  return withoutTrailingNewline.split("\n");
}

function buildUnifiedDiffLines(original: string, modified: string): DiffLine[] {
  const originalLines = splitLines(original);
  const modifiedLines = splitLines(modified);
  const cellCount = originalLines.length * modifiedLines.length;
  if (cellCount > 250_000) {
    return buildCoarseDiffLines(originalLines, modifiedLines);
  }

  const cols = modifiedLines.length + 1;
  const table = new Uint16Array((originalLines.length + 1) * cols);
  for (let i = originalLines.length - 1; i >= 0; i--) {
    for (let j = modifiedLines.length - 1; j >= 0; j--) {
      const index = i * cols + j;
      if (originalLines[i] === modifiedLines[j]) {
        table[index] = table[(i + 1) * cols + j + 1] + 1;
      } else {
        table[index] = Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
      }
    }
  }

  const lines: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  let sequence = 0;
  while (oldIndex < originalLines.length || newIndex < modifiedLines.length) {
    if (
      oldIndex < originalLines.length &&
      newIndex < modifiedLines.length &&
      originalLines[oldIndex] === modifiedLines[newIndex]
    ) {
      sequence += 1;
      lines.push({
        id: `c:${sequence}`,
        type: "context",
        oldLineNumber: oldIndex + 1,
        newLineNumber: newIndex + 1,
        text: originalLines[oldIndex] ?? "",
      });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    if (
      newIndex < modifiedLines.length &&
      (oldIndex >= originalLines.length ||
        table[oldIndex * cols + newIndex + 1] >= table[(oldIndex + 1) * cols + newIndex])
    ) {
      sequence += 1;
      lines.push({
        id: `a:${sequence}`,
        type: "added",
        newLineNumber: newIndex + 1,
        text: modifiedLines[newIndex] ?? "",
      });
      newIndex += 1;
      continue;
    }

    if (oldIndex < originalLines.length) {
      sequence += 1;
      lines.push({
        id: `r:${sequence}`,
        type: "removed",
        oldLineNumber: oldIndex + 1,
        text: originalLines[oldIndex] ?? "",
      });
      oldIndex += 1;
    }
  }

  return lines;
}

function buildCoarseDiffLines(originalLines: string[], modifiedLines: string[]): DiffLine[] {
  let sequence = 0;
  return [
    ...originalLines.map((text, index) => {
      sequence += 1;
      return {
        id: `r:${sequence}`,
        type: "removed" as const,
        oldLineNumber: index + 1,
        text,
      };
    }),
    ...modifiedLines.map((text, index) => {
      sequence += 1;
      return {
        id: `a:${sequence}`,
        type: "added" as const,
        newLineNumber: index + 1,
        text,
      };
    }),
  ];
}

function highlightCode(code: string): HighlightPart[] {
  if (code.length > 100_000) return [{ text: code, kind: "plain" }];

  const parts: HighlightPart[] = [];
  let lastIndex = 0;
  for (const match of code.matchAll(CODE_TOKEN_PATTERN)) {
    const text = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ text: code.slice(lastIndex, index), kind: "plain" });
    }
    parts.push({ text, kind: highlightKindForToken(text) });
    lastIndex = index + text.length;
  }
  if (lastIndex < code.length) {
    parts.push({ text: code.slice(lastIndex), kind: "plain" });
  }
  return parts;
}

function highlightKindForToken(token: string): HighlightKind {
  if (token.startsWith("//") || token.startsWith("/*")) return "comment";
  if (token.startsWith('"') || token.startsWith("'") || token.startsWith("`")) return "string";
  if (/^\d/.test(token)) return "number";
  if (/^[A-Z]/.test(token)) return "symbol";
  if (/^[{}()[\]<>/=:+\-*.,;?]$/.test(token)) return "punctuation";
  return "keyword";
}

function FileTypeIcon({
  path,
  size = 16,
  fallbackColor,
}: {
  path: string;
  size?: number;
  fallbackColor: string;
}) {
  const icon = fileIconForPath(path);
  if (icon) {
    return (
      <MaterialCommunityIcons
        name={icon.name}
        size={size}
        color={icon.color}
        style={styles.fileTreeIcon}
      />
    );
  }

  return (
    <SymbolView
      name={fileSymbol(path)}
      size={size}
      tintColor={fallbackColor}
      resizeMode="scaleAspectFit"
      style={styles.fileTreeIcon}
    />
  );
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
      style={[styles.fabWrap, { right: theme.spacing.lg, bottom: bottomInset + theme.spacing.lg }]}
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
        <View style={{ paddingTop: topInset }}>
          <ListRow
            title={selectedFile}
            subtitle="Preview"
            leading={
              <SymbolView name="chevron.left" size={16} tintColor={theme.colors.mutedForeground} />
            }
            onPress={closeFile}
            separator
          />
        </View>
        {contentLoading ? (
          <LoadingState label="Loading file..." />
        ) : (
          <ScrollView style={styles.preview} contentContainerStyle={styles.previewContent}>
            <HighlightedCode code={content ?? ""} />
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

function HighlightedCode({ code }: { code: string }) {
  const theme = useTheme();
  const parts = useMemo(() => highlightCode(code), [code]);
  const tokenStyles: Record<HighlightKind, { color: string }> = {
    plain: { color: theme.colors.foreground },
    comment: { color: theme.colors.dimForeground },
    string: { color: theme.colors.success },
    keyword: { color: theme.colors.accent },
    number: { color: theme.colors.warning },
    symbol: { color: "#c084fc" },
    punctuation: { color: theme.colors.mutedForeground },
  };

  return (
    <RNText style={[styles.codeText, { color: theme.colors.foreground }]}>
      {parts.map((part, index) => (
        <RNText key={`${index}:${part.kind}`} style={tokenStyles[part.kind]}>
          {part.text}
        </RNText>
      ))}
    </RNText>
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
  const fileIcon = fileIconForPath(node.name);
  const iconColor = node.isDirectory
    ? theme.colors.accent
    : (fileIcon?.color ?? theme.colors.mutedForeground);

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
      <View style={styles.fileTreeIconSlot}>
        {node.isDirectory ? (
          <SymbolView
            name={icon}
            size={15}
            tintColor={iconColor}
            resizeMode="scaleAspectFit"
            style={styles.fileTreeIcon}
          />
        ) : (
          <FileTypeIcon path={node.name} size={16} fallbackColor={theme.colors.mutedForeground} />
        )}
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
  const [selectedDiffFile, setSelectedDiffFile] = useState<BranchDiffFile | null>(null);
  const [diffContent, setDiffContent] = useState<{ original: string; modified: string } | null>(
    null,
  );
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
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

  const openDiff = useCallback(
    async (file: BranchDiffFile) => {
      setSelectedDiffFile(file);
      setDiffContent(null);
      setDiffError(null);
      setDiffLoading(true);
      try {
        const branchResult = await getClient()
          .query<DefaultBranchData>(SESSION_GROUP_DEFAULT_BRANCH_QUERY, { id: groupId })
          .toPromise();
        if (branchResult.error) throw branchResult.error;
        const defaultBranch = branchResult.data?.sessionGroup?.repo?.defaultBranch ?? "main";

        const [originalResult, modifiedResult] = await Promise.all([
          isAddedStatus(file.status)
            ? Promise.resolve({ data: { sessionGroupFileAtRef: "" }, error: undefined })
            : getClient()
                .query<FileAtRefData>(SESSION_GROUP_FILE_AT_REF_QUERY, {
                  sessionGroupId: groupId,
                  filePath: file.path,
                  ref: defaultBranch,
                })
                .toPromise(),
          isDeletedStatus(file.status)
            ? Promise.resolve({ data: { sessionGroupFileContent: "" }, error: undefined })
            : getClient()
                .query<FileContentForDiffData>(
                  SESSION_GROUP_FILE_CONTENT_FOR_DIFF_QUERY,
                  { sessionGroupId: groupId, filePath: file.path },
                  { requestPolicy: "network-only" },
                )
                .toPromise(),
        ]);
        if (originalResult.error) throw originalResult.error;
        if (modifiedResult.error) throw modifiedResult.error;
        setDiffContent({
          original: originalResult.data?.sessionGroupFileAtRef ?? "",
          modified: modifiedResult.data?.sessionGroupFileContent ?? "",
        });
      } catch (loadError) {
        setDiffError(loadError instanceof Error ? loadError.message : "Failed to load diff.");
      } finally {
        setDiffLoading(false);
      }
    },
    [groupId],
  );

  const closeDiff = useCallback(() => {
    setSelectedDiffFile(null);
    setDiffContent(null);
    setDiffError(null);
    setDiffLoading(false);
  }, []);

  if (selectedDiffFile) {
    return (
      <DiffPreview
        file={selectedDiffFile}
        content={diffContent}
        loading={diffLoading}
        error={diffError}
        topInset={topInset}
        onBack={closeDiff}
        onRetry={() => void openDiff(selectedDiffFile)}
      />
    );
  }

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
          onOpenFile={(file) => void openDiff(file)}
        />
      )}
    />
  );
}

function DiffPreview({
  file,
  content,
  loading,
  error,
  topInset,
  onBack,
  onRetry,
}: {
  file: BranchDiffFile;
  content: { original: string; modified: string } | null;
  loading: boolean;
  error: string | null;
  topInset: number;
  onBack: () => void;
  onRetry: () => void;
}) {
  const theme = useTheme();
  const lines = useMemo(
    () => (content ? buildUnifiedDiffLines(content.original, content.modified) : []),
    [content],
  );

  return (
    <View style={styles.panel}>
      <View style={{ paddingTop: topInset }}>
        <ListRow
          title={file.path}
          subtitle={`${file.status}  +${file.additions} -${file.deletions}`}
          leading={
            <SymbolView name="chevron.left" size={16} tintColor={theme.colors.mutedForeground} />
          }
          onPress={onBack}
          separator
        />
      </View>
      {loading ? (
        <LoadingState label="Loading diff..." />
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : lines.length === 0 ? (
        <EmptyState label="No diff content" />
      ) : (
        <FlatList
          data={lines}
          keyExtractor={(line) => line.id}
          initialNumToRender={40}
          maxToRenderPerBatch={40}
          windowSize={9}
          removeClippedSubviews
          contentContainerStyle={styles.diffContent}
          renderItem={({ item }) => <DiffLineRow line={item} />}
        />
      )}
    </View>
  );
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const theme = useTheme();
  const isAdded = line.type === "added";
  const isRemoved = line.type === "removed";
  const marker = isAdded ? "+" : isRemoved ? "-" : " ";
  const backgroundColor = isAdded
    ? alpha(theme.colors.success, 0.1)
    : isRemoved
      ? alpha(theme.colors.destructive, 0.1)
      : "transparent";
  const markerColor = isAdded
    ? theme.colors.success
    : isRemoved
      ? theme.colors.destructive
      : theme.colors.dimForeground;

  return (
    <View style={[styles.diffLineRow, { backgroundColor }]}>
      <RNText style={[styles.diffLineNumber, { color: theme.colors.dimForeground }]}>
        {line.oldLineNumber ?? ""}
      </RNText>
      <RNText style={[styles.diffLineNumber, { color: theme.colors.dimForeground }]}>
        {line.newLineNumber ?? ""}
      </RNText>
      <RNText style={[styles.diffMarker, { color: markerColor }]}>{marker}</RNText>
      <View style={styles.diffLineText}>
        <HighlightedCodeLine code={line.text.length > 0 ? line.text : " "} />
      </View>
    </View>
  );
}

function HighlightedCodeLine({ code }: { code: string }) {
  const theme = useTheme();
  const parts = useMemo(() => highlightCode(code), [code]);
  const tokenStyles: Record<HighlightKind, { color: string }> = {
    plain: { color: theme.colors.foreground },
    comment: { color: theme.colors.dimForeground },
    string: { color: theme.colors.success },
    keyword: { color: theme.colors.accent },
    number: { color: theme.colors.warning },
    symbol: { color: "#c084fc" },
    punctuation: { color: theme.colors.mutedForeground },
  };

  return (
    <RNText style={[styles.diffCodeText, { color: theme.colors.foreground }]}>
      {parts.map((part, index) => (
        <RNText key={`${index}:${part.kind}`} style={tokenStyles[part.kind]}>
          {part.text}
        </RNText>
      ))}
    </RNText>
  );
}

function BranchChangeTreeRow({
  node,
  expanded,
  onToggle,
  onOpenFile,
}: {
  node: VisibleBranchChangeTreeNode;
  expanded: boolean;
  onToggle: (path: string) => void;
  onOpenFile: (file: BranchDiffFile) => void;
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
        else if (file) onOpenFile(file);
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
      <View style={styles.fileTreeIconSlot}>
        {node.isDirectory ? (
          <SymbolView
            name={icon}
            size={15}
            tintColor={theme.colors.accent}
            resizeMode="scaleAspectFit"
            style={styles.fileTreeIcon}
          />
        ) : (
          <FileTypeIcon path={node.name} size={16} fallbackColor={changeColor} />
        )}
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

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void | Promise<void>;
}) {
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
  fileTreeIconSlot: {
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
  diffContent: {
    paddingTop: 8,
    paddingBottom: 96,
  },
  diffLineRow: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  diffLineNumber: {
    width: 34,
    fontFamily: "SpaceMono",
    fontSize: 11,
    lineHeight: 18,
    textAlign: "right",
  },
  diffMarker: {
    width: 18,
    fontFamily: "SpaceMono",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  diffLineText: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 2,
  },
  diffCodeText: {
    fontFamily: "SpaceMono",
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0,
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
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 96,
  },
  codeText: {
    fontFamily: "SpaceMono",
    fontSize: 13,
    lineHeight: 20,
    letterSpacing: 0,
  },
});
