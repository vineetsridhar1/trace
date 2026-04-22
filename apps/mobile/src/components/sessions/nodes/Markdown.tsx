import { memo, useMemo } from "react";
import { Linking, Platform, StyleSheet, Text as NativeText } from "react-native";
import MarkdownLib from "react-native-markdown-display";
import { alpha, useTheme, type Theme } from "@/theme";

interface MarkdownProps {
  children: string;
  compactSpacing?: boolean;
}

// Assistant content is LLM-generated, so we only open links whose scheme we
// explicitly trust. Unknown/custom schemes (tel:, sms:, trace:, etc.) are
// dropped rather than handed to `Linking.openURL`.
const ALLOWED_LINK_SCHEMES = /^(https?|mailto):/i;
const MARKDOWN_HINTS =
  /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|~~~)|[*_`\[\]]|!\[|https?:\/\/|mailto:/i;

/**
 * Theme-aware markdown renderer. Mirrors the subset used by web's `Markdown`
 * wrapper — headers, lists, inline code, code blocks, blockquotes, links.
 * No KaTeX / images in V1.
 */
export const Markdown = memo(function Markdown({
  children,
  compactSpacing = false,
}: MarkdownProps) {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme, compactSpacing), [compactSpacing, theme]);

  if (!MARKDOWN_HINTS.test(children)) {
    return <NativeText style={styles.plainText}>{children}</NativeText>;
  }

  return (
    <MarkdownLib style={styles} onLinkPress={openTrustedMarkdownLink}>
      {children}
    </MarkdownLib>
  );
});

function openTrustedMarkdownLink(url: string): boolean {
  if (!ALLOWED_LINK_SCHEMES.test(url)) return false;
  void Linking.openURL(url);
  return true;
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
