import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { createElement } from 'react';
import type { Highlighter } from 'shiki';
import type { DiffRuntime, ParsedHunk } from '../types';
import { getHighlighter, langFromPath, loadedLanguages } from '../components/SyntaxHighlight';

// Max change lines before we skip highlighting (perf guard)
const MAX_CHANGE_LINES = 1000;

/**
 * Creates a refractor-compatible adapter from a Shiki highlighter.
 * react-diff-view's `tokenize()` calls `refractor.highlight(code, language)`
 * and expects HAST nodes back. Shiki produces ThemedToken[][] which we convert.
 */
function createShikiRefractor(highlighter: Highlighter) {
  return {
    highlight(code: string, language: string) {
      const tokens = highlighter.codeToTokensBase(code, {
        lang: language as Parameters<Highlighter['codeToTokensBase']>[1]['lang'],
        theme: 'tokyo-night',
      });

      // Convert ThemedToken[][] to flat HAST nodes with \n separators between lines
      const nodes: Array<{ type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: Array<{ type: string; value: string }> }> = [];
      for (let lineIdx = 0; lineIdx < tokens.length; lineIdx++) {
        if (lineIdx > 0) {
          nodes.push({ type: 'text', value: '\n' });
        }
        for (const token of tokens[lineIdx]) {
          if (token.color) {
            nodes.push({
              type: 'element',
              tagName: 'span',
              properties: { style: `color:${token.color}` },
              children: [{ type: 'text', value: token.content }],
            });
          } else {
            nodes.push({ type: 'text', value: token.content });
          }
        }
      }
      return nodes;
    },
  };
}

/**
 * Custom renderToken for react-diff-view that handles Shiki's inline style tokens.
 * The default renderer only knows about CSS class-based tokens (from Prism/refractor).
 * We delegate `text`, `mark`, `edit` types to the default renderer (preserves word-level
 * diff highlighting from markEdits), and handle element nodes with `properties.style` ourselves.
 */
export function shikiRenderToken(
  token: Record<string, unknown>,
  defaultRender: (token: Record<string, unknown>, index: number) => ReactNode,
  index: number,
): ReactNode {
  // Let default handle text, mark, edit types (preserves diff word highlighting)
  if (token.type === 'text' || token.type === 'mark' || token.type === 'edit') {
    return defaultRender(token, index);
  }

  // Handle Shiki element nodes with inline style
  const properties = token.properties as Record<string, unknown> | undefined;
  const styleStr = properties?.style;
  if (typeof styleStr === 'string' && styleStr) {
    const reactStyle = cssStringToObject(styleStr);
    const children = token.children as Array<Record<string, unknown>> | undefined;
    return createElement(
      'span',
      { style: reactStyle, key: index },
      children
        ? children.map((child, i) =>
            child.type === 'text'
              ? (child.value as string)
              : shikiRenderToken(child, defaultRender, i),
          )
        : (token.value as string),
    );
  }

  // Fallback to default for anything else
  return defaultRender(token, index);
}

/** Convert a CSS style string like "color:#a1a1aa" to a React style object */
function cssStringToObject(css: string): Record<string, string> {
  const style: Record<string, string> = {};
  for (const part of css.split(';')) {
    const colonIdx = part.indexOf(':');
    if (colonIdx < 0) continue;
    const prop = part.slice(0, colonIdx).trim();
    const value = part.slice(colonIdx + 1).trim();
    if (!prop || !value) continue;
    // Convert kebab-case to camelCase
    const camelProp = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    style[camelProp] = value;
  }
  return style;
}

/** Count total change lines in hunks */
function countChangeLines(hunks: ParsedHunk[]): number {
  let count = 0;
  for (const hunk of hunks) {
    const changes = (hunk as Record<string, unknown>).changes as Array<unknown> | undefined;
    if (Array.isArray(changes)) {
      count += changes.length;
    }
  }
  return count;
}

interface UseDiffSyntaxTokensResult {
  tokens: { old: unknown[][]; new: unknown[][] } | null;
  renderToken: ((token: Record<string, unknown>, defaultRender: (token: Record<string, unknown>, index: number) => ReactNode, index: number) => ReactNode) | undefined;
}

/**
 * Hook that provides syntax-highlighted tokens for react-diff-view's <Diff> component.
 * Async loads the Shiki highlighter + language, then tokenizes via react-diff-view's pipeline.
 */
export function useDiffSyntaxTokens(
  hunks: ParsedHunk[],
  filePath: string | null,
  runtime: DiffRuntime | null,
  enabled = true,
): UseDiffSyntaxTokensResult {
  const [tokens, setTokens] = useState<{ old: unknown[][]; new: unknown[][] } | null>(null);

  const stableRenderToken = useCallback(
    (token: Record<string, unknown>, defaultRender: (token: Record<string, unknown>, index: number) => ReactNode, index: number) =>
      shikiRenderToken(token, defaultRender, index),
    [],
  );

  useEffect(() => {
    if (!enabled || !runtime || !filePath || hunks.length === 0) {
      setTokens(null);
      return;
    }

    const lang = langFromPath(filePath);
    if (!lang) {
      setTokens(null);
      return;
    }

    if (countChangeLines(hunks) > MAX_CHANGE_LINES) {
      setTokens(null);
      return;
    }

    let cancelled = false;

    async function tokenize() {
      try {
        const highlighter = await getHighlighter();
        if (!loadedLanguages.has(lang!)) {
          await highlighter.loadLanguage(lang as Parameters<Highlighter['loadLanguage']>[0]);
          loadedLanguages.add(lang!);
        }
        if (cancelled) return;

        const refractor = createShikiRefractor(highlighter);
        const result = runtime!.tokenize(hunks, {
          highlight: true,
          refractor,
          language: lang,
          enhancers: [runtime!.markEdits(hunks, { type: 'block' })],
        });
        if (!cancelled) {
          setTokens(result);
        }
      } catch {
        // Language not supported or tokenization failed — degrade gracefully
        if (!cancelled) setTokens(null);
      }
    }

    tokenize();
    return () => { cancelled = true; };
  }, [hunks, filePath, runtime, enabled]);

  return {
    tokens,
    renderToken: tokens ? stableRenderToken : undefined,
  };
}
