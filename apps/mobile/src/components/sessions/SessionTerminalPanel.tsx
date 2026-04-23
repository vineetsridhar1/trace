import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import {
  CREATE_TERMINAL_MUTATION,
  SESSION_TERMINALS_QUERY,
} from "@trace/client-core";
import type { Terminal } from "@trace/gql";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { Button, Spinner, Text } from "@/components/design-system";
import { TerminalSocket } from "@/lib/terminal-ws";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";

interface SessionTerminalPanelProps {
  sessionId: string;
}

type TerminalViewStatus =
  | "loading"
  | "connecting"
  | "active"
  | "reconnecting"
  | "exited"
  | "error";

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;
const TERMINAL_RUNTIME_HTML = require("../../assets/terminal-runtime.html");
const TERMINAL_RUNTIME_ERROR = "Couldn't load the terminal runtime";

function buildTerminalHtml(
  template: string,
  themeBackground: string,
  themeForeground: string,
): string {
  return template
    .replaceAll("__TRACE_THEME_BACKGROUND__", themeBackground)
    .replaceAll("__TRACE_THEME_FOREGROUND__", themeForeground);
}

function pickLatestSessionTerminal(
  terminals: Terminal[] | undefined,
  sessionId: string,
): Terminal | null {
  if (!terminals || terminals.length === 0) return null;
  for (let i = terminals.length - 1; i >= 0; i -= 1) {
    const terminal = terminals[i];
    if (terminal?.sessionId === sessionId) return terminal;
  }
  return null;
}

export function SessionTerminalPanel({ sessionId }: SessionTerminalPanelProps) {
  const theme = useTheme();
  const webViewRef = useRef<WebView>(null);
  const socketRef = useRef<TerminalSocket | null>(null);
  const webReadyRef = useRef(false);
  const mountedRef = useRef(true);
  const requestTokenRef = useRef(0);
  const pendingWritesRef = useRef<string[]>([]);
  const needsClearRef = useRef(false);
  const surfaceHeightRef = useRef(0);
  const [runtimeTemplate, setRuntimeTemplate] = useState<string | null>(null);
  const [webReady, setWebReady] = useState(false);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [status, setStatus] = useState<TerminalViewStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);

  const terminalHtml = useMemo(
    () =>
      runtimeTemplate
        ? buildTerminalHtml(runtimeTemplate, theme.colors.surfaceDeep, theme.colors.foreground)
        : null,
    [runtimeTemplate, theme.colors.foreground, theme.colors.surfaceDeep],
  );

  const isRequestCurrent = useCallback((token: number) => {
    return mountedRef.current && requestTokenRef.current === token;
  }, []);

  const inject = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(`${script}\ntrue;`);
  }, []);

  const clearTerminal = useCallback(() => {
    if (!webReadyRef.current) {
      needsClearRef.current = true;
      return;
    }
    inject("window.__traceClear && window.__traceClear();");
  }, [inject]);

  const writeTerminal = useCallback(
    (data: string) => {
      if (!webReadyRef.current) {
        pendingWritesRef.current.push(data);
        return;
      }
      inject(`window.__traceWrite && window.__traceWrite(${JSON.stringify(data)});`);
    },
    [inject],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const asset = Asset.fromModule(TERMINAL_RUNTIME_HTML);
        await asset.downloadAsync();
        const uri = asset.localUri ?? asset.uri;
        if (!uri) throw new Error("Missing terminal runtime asset URI");
        const template = await new File(uri).text();
        if (cancelled) return;
        setRuntimeTemplate(template);
      } catch (error) {
        if (cancelled) return;
        console.warn("[terminal-panel] runtime asset load failed", error);
        setStatus("error");
        setMessage(TERMINAL_RUNTIME_ERROR);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const createTerminal = useCallback(async (): Promise<string> => {
    const result = await getClient()
      .mutation<{ createTerminal: Terminal }>(CREATE_TERMINAL_MUTATION, {
        sessionId,
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
      })
      .toPromise();
    if (result.error || !result.data?.createTerminal.id) {
      throw new Error(result.error?.message ?? "Couldn't create terminal");
    }
    return result.data.createTerminal.id;
  }, [sessionId]);

  const attachSocket = useCallback(
    (nextTerminalId: string) => {
      socketRef.current?.close();
      clearTerminal();
      setTerminalId(nextTerminalId);
      setStatus("connecting");
      setMessage(null);

      const socket = new TerminalSocket(nextTerminalId);
      socketRef.current = socket;
      socket.onEvent((event) => {
        switch (event.type) {
          case "ready":
            setStatus("active");
            setMessage(null);
            inject("window.__traceFocus && window.__traceFocus();");
            break;
          case "output":
            writeTerminal(event.data);
            break;
          case "exit":
            setStatus("exited");
            writeTerminal("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
            break;
          case "error":
            setStatus("error");
            setMessage(event.message);
            writeTerminal(`\r\n\x1b[31m[Error: ${event.message}]\x1b[0m\r\n`);
            break;
          case "reconnecting":
            setStatus("reconnecting");
            writeTerminal("\r\n\x1b[33m[Reconnecting...]\x1b[0m\r\n");
            break;
          case "reconnected":
            setStatus("active");
            break;
          case "disconnected":
            setStatus("exited");
            setMessage("Connection lost");
            writeTerminal("\r\n\x1b[33m[Connection lost]\x1b[0m\r\n");
            break;
        }
      });
      socket.connect();
    },
    [clearTerminal, inject, writeTerminal],
  );

  const ensureTerminal = useCallback(
    async (forceNew = false) => {
      const requestToken = requestTokenRef.current + 1;
      requestTokenRef.current = requestToken;
      try {
        if (!isRequestCurrent(requestToken)) return;
        setStatus("loading");
        setMessage(null);

        let nextTerminalId: string | null = null;
        if (!forceNew) {
          const result = await getClient()
            .query<{ sessionTerminals: Terminal[] }>(SESSION_TERMINALS_QUERY, { sessionId })
            .toPromise();
          if (!isRequestCurrent(requestToken)) return;
          const existing = pickLatestSessionTerminal(result.data?.sessionTerminals, sessionId);
          nextTerminalId = existing?.id ?? null;
        }

        if (!nextTerminalId) {
          nextTerminalId = await createTerminal();
          if (!isRequestCurrent(requestToken)) return;
        }

        attachSocket(nextTerminalId);
      } catch (error) {
        if (!isRequestCurrent(requestToken)) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Couldn't open terminal");
      }
    },
    [attachSocket, createTerminal, isRequestCurrent, sessionId],
  );

  useEffect(() => {
    webReadyRef.current = webReady;
  }, [webReady]);

  useEffect(() => {
    mountedRef.current = true;
    setWebReady(false);
    webReadyRef.current = false;
    pendingWritesRef.current = [];
    needsClearRef.current = true;
    if (runtimeTemplate) {
      void ensureTerminal();
    }
    return () => {
      mountedRef.current = false;
      requestTokenRef.current += 1;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [ensureTerminal, runtimeTemplate]);

  useEffect(() => {
    if (!webReady) return;
    if (needsClearRef.current) {
      inject("window.__traceClear && window.__traceClear();");
      needsClearRef.current = false;
    }
    for (const output of pendingWritesRef.current) {
      inject(`window.__traceWrite && window.__traceWrite(${JSON.stringify(output)});`);
    }
    pendingWritesRef.current = [];
    inject("window.__traceFit && window.__traceFit();");
  }, [inject, webReady]);

  const handleSurfaceLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = Math.round(event.nativeEvent.layout.height);
      if (surfaceHeightRef.current === nextHeight) return;
      surfaceHeightRef.current = nextHeight;
      if (webReadyRef.current) {
        inject("window.__traceFit && window.__traceFit();");
      }
    },
    [inject],
  );

  const handleWebMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const message = JSON.parse(event.nativeEvent.data) as
          | { type: "ready" }
          | { type: "bootstrap_error" }
          | { type: "input"; data: string }
          | { type: "resize"; cols: number; rows: number };

        if (message.type === "ready") {
          webReadyRef.current = true;
          setWebReady(true);
          return;
        }
        if (message.type === "bootstrap_error") {
          setStatus("error");
          setMessage(TERMINAL_RUNTIME_ERROR);
          return;
        }
        if (message.type === "input") {
          socketRef.current?.write(message.data);
          return;
        }
        if (message.type === "resize") {
          socketRef.current?.resize(message.cols, message.rows);
        }
      } catch {
        // Ignore malformed bridge messages from the embedded terminal.
      }
    },
    [],
  );

  const statusLabel =
    status === "loading"
      ? "Loading"
      : status === "connecting"
        ? "Connecting"
        : status === "active"
          ? "Live"
          : status === "reconnecting"
            ? "Reconnecting"
            : status === "exited"
              ? "Exited"
              : "Error";

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.toolbar,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
            paddingHorizontal: theme.spacing.md,
          },
        ]}
      >
        <View style={styles.statusBlock}>
          <Text variant="footnote" color="mutedForeground">
            {statusLabel}
          </Text>
          <Text variant="caption1" color="dimForeground" numberOfLines={1}>
            {message ?? (terminalId ? `Terminal ${terminalId.slice(0, 8)}` : "Starting shell")}
          </Text>
        </View>
        <Button
          title="New"
          size="sm"
          variant="secondary"
          disabled={!runtimeTemplate}
          onPress={() => {
            void ensureTerminal(true);
          }}
        />
      </View>

      <View
        style={[styles.surface, { backgroundColor: theme.colors.surfaceDeep }]}
        onLayout={handleSurfaceLayout}
      >
        {terminalHtml ? (
          <WebView
            ref={webViewRef}
            originWhitelist={["*"]}
            source={{ html: terminalHtml }}
            onMessage={handleWebMessage}
            style={styles.webView}
            scrollEnabled={false}
            bounces={false}
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
          />
        ) : null}

        {!webReady && status === "loading" ? (
          <View style={styles.overlay}>
            <Spinner size="small" color="mutedForeground" />
          </View>
        ) : null}

        {status === "error" ? (
          <View style={[styles.overlay, styles.errorOverlay]}>
            <Text variant="body" color="foreground" align="center">
              {message ?? "Couldn't open terminal"}
            </Text>
            <Button
              title="Retry"
              variant="secondary"
              onPress={() => {
                void ensureTerminal(true);
              }}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  toolbar: {
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
  },
  statusBlock: {
    flex: 1,
    minWidth: 0,
  },
  surface: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: "transparent",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  errorOverlay: {
    gap: 12,
    paddingHorizontal: 24,
  },
});
