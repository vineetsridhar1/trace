import { memo, useMemo, type ReactNode } from "react";
import {
  Linking,
  Platform,
  StyleSheet,
  Text as NativeText,
  View,
  type NativeSyntheticEvent,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import MarkdownLib, { type ASTNode, type RenderRules } from "react-native-markdown-display";
import ContextMenu, {
  type ContextMenuAction,
  type ContextMenuOnPressNativeEvent,
} from "react-native-context-menu-view";
import { alpha, useTheme, type Theme } from "@/theme";
import { haptic } from "@/lib/haptics";
import { splitCopyBlocks, type CopyBlock } from "./copy-blocks";

interface MarkdownProps {
  children: string;
  compactSpacing?: boolean;
  copyBlocks?: boolean;
}

// Assistant content is LLM-generated, so we only open links whose scheme we
// explicitly trust. Unknown/custom schemes (tel:, sms:, trace:, etc.) are
// dropped rather than handed to `Linking.openURL`.
const ALLOWED_LINK_SCHEMES = /^(https?|mailto):/i;
const MARKDOWN_HINTS =
  /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|~~~)|[*_`[\]]|!\[|https?:\/\/|mailto:/i;
const COPY_ACTION_INDEX = 0;
const COPY_CONTEXT_MENU: ContextMenuAction[] = [{ title: "Copy" }];

/**
 * Theme-aware markdown renderer. Mirrors the subset used by web's `Markdown`
 * wrapper — headers, lists, inline code, code blocks, blockquotes, links.
 * No KaTeX / images in V1.
 */
export const Markdown = memo(function Markdown({
  children,
  compactSpacing = false,
  copyBlocks = false,
}: MarkdownProps) {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme, compactSpacing), [compactSpacing, theme]);
  const sourceBlocks = useMemo(
    () => (copyBlocks ? splitCopyBlocks(children) : []),
    [children, copyBlocks],
  );

  if (!MARKDOWN_HINTS.test(children)) {
    const plainText = <NativeText style={styles.plainText}>{children}</NativeText>;
    return copyBlocks ? renderCopyContextMenu(children, plainText) : plainText;
  }

  return (
    <MarkdownLib
      style={styles}
      rules={copyBlocks ? createCopyRules(sourceBlocks) : undefined}
      onLinkPress={openTrustedMarkdownLink}
    >
      {children}
    </MarkdownLib>
  );
});

function openTrustedMarkdownLink(url: string): boolean {
  if (!ALLOWED_LINK_SCHEMES.test(url)) return false;
  void Linking.openURL(url);
  return true;
}

function renderCopyContextMenu(
  copyText: string,
  children: ReactNode,
  key?: string,
  style?: object,
) {
  const text = copyText.trim();
  if (!text) return children;

  const handlePress = (event: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => {
    if (event.nativeEvent.index === COPY_ACTION_INDEX) void copyBlock(text);
  };

  return (
    <ContextMenu key={key} actions={COPY_CONTEXT_MENU} onPress={handlePress} style={style}>
      {children}
    </ContextMenu>
  );
}

async function copyBlock(text: string) {
  const copyText = text.trim();
  if (!copyText) return;
  await Clipboard.setStringAsync(copyText);
  void haptic.light();
}

function createCopyRules(sourceBlocks: CopyBlock[]): RenderRules {
  const state = { index: 0, sourceBlocks };

  return {
    heading1: (node, children, parent, styles) =>
      renderCopyableView(node, children, parent, styles._VIEW_SAFE_heading1, state),
    heading2: (node, children, parent, styles) =>
      renderCopyableView(node, children, parent, styles._VIEW_SAFE_heading2, state),
    heading3: (node, children, parent, styles) =>
      renderCopyableView(node, children, parent, styles._VIEW_SAFE_heading3, state),
    heading4: (node, children, parent, styles) =>
      renderCopyableView(node, children, parent, styles._VIEW_SAFE_heading4, state),
    heading5: (node, children, parent, styles) =>
      renderCopyableView(node, children, parent, styles._VIEW_SAFE_heading5, state),
    heading6: (node, children, parent, styles) =>
      renderCopyableView(node, children, parent, styles._VIEW_SAFE_heading6, state),
    paragraph: (node, children, parent, styles) =>
      renderCopyableView(node, children, parent, styles._VIEW_SAFE_paragraph, state),
    blockquote: (node, children, parent, styles) =>
      renderCopyableView(node, children, parent, styles._VIEW_SAFE_blockquote, state),
    bullet_list: (node, children, parent, styles) =>
      renderCopyableView(node, children, parent, styles._VIEW_SAFE_bullet_list, state),
    ordered_list: (node, children, parent, styles) =>
      renderCopyableView(node, children, parent, styles._VIEW_SAFE_ordered_list, state),
    code_block: (node, _children, parent, styles, inheritedStyles = {}) =>
      renderCopyableCodeText(node, parent, [inheritedStyles, styles.code_block], state),
    fence: (node, _children, parent, styles, inheritedStyles = {}) =>
      renderCopyableCodeText(node, parent, [inheritedStyles, styles.fence], state),
  };
}

function renderCopyableView(
  node: ASTNode,
  children: ReactNode[],
  parent: ASTNode[],
  style: object,
  state: { index: number; sourceBlocks: CopyBlock[] },
) {
  if (!isTopLevelBlock(parent)) {
    return (
      <View key={node.key} style={style}>
        {children}
      </View>
    );
  }

  const copyText = nextCopyText(node, state);
  return renderCopyContextMenu(copyText, <View>{children}</View>, node.key, style);
}

function renderCopyableCodeText(
  node: ASTNode,
  parent: ASTNode[],
  style: object[],
  state: { index: number; sourceBlocks: CopyBlock[] },
) {
  const content = trimTrailingNewline(node.content);

  if (!isTopLevelBlock(parent)) {
    return (
      <NativeText key={node.key} style={style}>
        {content}
      </NativeText>
    );
  }

  const copyText = nextCopyText(node, state);
  return renderCopyContextMenu(copyText, <NativeText style={style}>{content}</NativeText>, node.key);
}

function isTopLevelBlock(parent: ASTNode[]): boolean {
  return parent.length === 1 && parent[0]?.type === "body";
}

function nextCopyText(node: ASTNode, state: { index: number; sourceBlocks: CopyBlock[] }): string {
  const sourceBlock = state.sourceBlocks[state.index]?.text;
  state.index += 1;
  return sourceBlock ?? astNodeToText(node);
}

function astNodeToText(node: ASTNode): string {
  if (node.type === "code_block" || node.type === "fence") {
    return trimTrailingNewline(node.content);
  }
  if (node.type === "bullet_list") {
    return node.children.map((child) => `- ${astNodeToText(child).trim()}`).join("\n");
  }
  if (node.type === "ordered_list") {
    return node.children
      .map((child, index) => `${index + 1}. ${astNodeToText(child).trim()}`)
      .join("\n");
  }
  if (node.content) return node.content;
  return node.children.map(astNodeToText).join("");
}

function trimTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

function buildStyles(theme: Theme, compactSpacing: boolean) {
  const codeBg = alpha(theme.colors.surfaceElevated, 0.6);
  const paragraphMarginBottom = compactSpacing ? theme.spacing.xs : theme.spacing.sm;
  return StyleSheet.create({
    body: {
      color: theme.colors.foreground,
      fontSize: 15,
      lineHeight: 22,
    },
    plainText: {
      color: theme.colors.foreground,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: paragraphMarginBottom,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: paragraphMarginBottom,
    },
    strong: { fontWeight: "700" as const },
    em: { fontStyle: "italic" as const },
    heading1: {
      color: theme.colors.foreground,
      fontSize: 22,
      lineHeight: 28,
      fontWeight: "700" as const,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    heading2: {
      color: theme.colors.foreground,
      fontSize: 19,
      lineHeight: 25,
      fontWeight: "700" as const,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.xs,
    },
    heading3: {
      color: theme.colors.foreground,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: "600" as const,
      marginTop: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
    },
    bullet_list: { marginBottom: paragraphMarginBottom },
    ordered_list: { marginBottom: paragraphMarginBottom },
    list_item: { marginBottom: 2, color: theme.colors.foreground },
    code_inline: {
      color: theme.colors.foreground,
      backgroundColor: codeBg,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: theme.radius.sm,
      fontFamily: mono,
      fontSize: 13,
    },
    code_block: {
      color: theme.colors.foreground,
      backgroundColor: codeBg,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.sm,
      fontFamily: mono,
      fontSize: 13,
      marginVertical: theme.spacing.xs,
    },
    fence: {
      color: theme.colors.foreground,
      backgroundColor: codeBg,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.sm,
      fontFamily: mono,
      fontSize: 13,
      marginVertical: theme.spacing.xs,
    },
    blockquote: {
      backgroundColor: alpha(theme.colors.foreground, 0.04),
      borderLeftColor: theme.colors.borderMuted,
      borderLeftWidth: 3,
      paddingHorizontal: theme.spacing.sm,
      marginVertical: theme.spacing.xs,
    },
    link: { color: theme.colors.accent },
    hr: { backgroundColor: theme.colors.border, height: 1, marginVertical: theme.spacing.sm },
  });
}
