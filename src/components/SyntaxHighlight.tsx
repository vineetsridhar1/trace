import { useEffect, useState, useRef } from 'react';
import { createHighlighter, type Highlighter } from 'shiki';

let highlighterPromise: Promise<Highlighter> | null = null;
export const loadedLanguages = new Set<string>();

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['tokyo-night'],
      langs: [],
    });
  }
  return highlighterPromise;
}

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  json: 'json',
  jsonc: 'jsonc',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  md: 'markdown',
  mdx: 'mdx',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  tf: 'hcl',
  lua: 'lua',
  vim: 'viml',
  r: 'r',
  m: 'objective-c',
  mm: 'objective-cpp',
  dart: 'dart',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  scala: 'scala',
  clj: 'clojure',
  vue: 'vue',
  svelte: 'svelte',
  astro: 'astro',
  zig: 'zig',
  nix: 'nix',
  prisma: 'prisma',
};

export function langFromPath(filePath: string): string | null {
  const name = filePath.split('/').pop() ?? '';
  if (name.toLowerCase() === 'dockerfile') return 'dockerfile';
  const ext = name.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  return EXT_TO_LANG[ext] ?? null;
}

export function SyntaxHighlightedCode({
  code,
  filePath,
}: {
  code: string;
  filePath: string | null;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const codeRef = useRef(code);
  const pathRef = useRef(filePath);
  codeRef.current = code;
  pathRef.current = filePath;

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      const lang = pathRef.current ? langFromPath(pathRef.current) : null;
      if (!lang) return;

      try {
        const h = await getHighlighter();
        if (!loadedLanguages.has(lang)) {
          await h.loadLanguage(lang as Parameters<Highlighter['loadLanguage']>[0]);
          loadedLanguages.add(lang);
        }
        if (cancelled) return;
        const result = h.codeToHtml(codeRef.current, {
          lang,
          theme: 'tokyo-night',
        });
        if (!cancelled) setHtml(result);
      } catch {
        // Language not supported — keep plain text
      }
    }

    highlight();
    return () => { cancelled = true; };
  }, [code, filePath]);

  if (html) {
    return (
      <div
        className="shiki-wrapper max-h-[340px] overflow-auto text-xs leading-relaxed [&_pre]:!bg-transparent [&_pre]:p-2 [&_code]:font-mono"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <pre className="max-h-[340px] overflow-auto p-2 font-mono text-xs leading-relaxed text-[#c0caf5]">
      {code}
    </pre>
  );
}
