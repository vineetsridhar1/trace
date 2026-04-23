import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
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
const XTERM_VERSION = "5.5.0";
const FIT_ADDON_VERSION = "0.10.0";

function buildTerminalHtml(themeBackground: string, themeForeground: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <link
      rel="stylesheet"
      href="https://unpkg.com/@xterm/xterm@${XTERM_VERSION}/css/xterm.css"
    />
    <style>
      html, body, #terminal {
        margin: 0;
        width: 100%;
        height: 100%;
        background: ${themeBackground};
        overflow: hidden;
      }
      body {
        color: ${themeForeground};
        font-family: ui-monospace, Menlo, monospace;
      }
    </style>
  </head>
  <body>
    <div id="terminal"></div>
    <script src="https://unpkg.com/@xterm/xterm@${XTERM_VERSION}/lib/xterm.js"></script>
    <script src="https://unpkg.com/@xterm/addon-fit@${FIT_ADDON_VERSION}/lib/addon-fit.js"></script>
    <script>
      (function () {
        const post = (message) => {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(message));
          }
        };
        let attempts = 0;
        let term = null;
        let fitAddon = null;
        let resizeTimer = null;

        function fit() {
          if (!term || !fitAddon) return;
          try {
            fitAddon.fit();
            post({ type: "resize", cols: term.cols, rows: term.rows });
          } catch (error) {
            // Ignore transient layout errors while the view settles.
          }
        }

        function boot() {
          if (!window.Terminal || !window.FitAddon || !document.getElementById("terminal")) {
            attempts += 1;
            if (attempts > 120) {
              post({ type: "bootstrap_error" });
              return;
            }
            setTimeout(boot, 50);
            return;
          }

          term = new window.Terminal({
            cursorBlink: true,
            fontSize: 13,
            fontFamily: "Menlo, ui-monospace, monospace",
            theme: {
              background: "${themeBackground}",
              foreground: "${themeForeground}",
              cursor: "${themeForeground}",
              selectionBackground: "rgba(161,161,170,0.32)"
            }
          });

          fitAddon = new window.FitAddon.FitAddon();
          term.loadAddon(fitAddon);
          term.open(document.getElementById("terminal"));
          term.focus();
          term.onData((data) => post({ type: "input", data }));

          window.__traceWrite = function (data) {
            if (term) term.write(data);
          };
          window.__traceClear = function () {
            if (term) term.clear();
          };
          window.__traceFocus = function () {
            if (term) term.focus();
          };
          window.__traceFit = fit;

          fit();
          post({ type: "ready" });

          window.addEventListener("resize", function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(fit, 100);
          });
        }

        boot();
      })();
    </script>
  </body>
</html>`;
}

export function SessionTerminalPanel({ sessionId }: SessionTerminalPanelProps) {
  const theme = useTheme();
  const webViewRef = useRef<WebView>(null);
  const socketRef = useRef<TerminalSocket | null>(null);
  const pendingWritesRef = useRef<string[]>([]);
  const needsClearRef = useRef(false);
  const [webReady, setWebReady] = useState(false);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [status, setStatus] = useState<TerminalViewStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);

  const terminalHtml = useMemo(
    () => buildTerminalHtml(theme.colors.surfaceDeep, theme.colors.foreground),
    [theme.colors.foreground, theme.colors.surfaceDeep],
  );

  const inject = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(`${script}\ntrue;`);
  }, []);

  const clearTerminal = useCallback(() => {
    if (!webReady) {
      needsClearRef.current = true;
      return;
    }
    inject("window.__traceClear && window.__traceClear();");
  }, [inject, webReady]);

  const writeTerminal = useCallback(
    (data: string) => {
      if (!webReady) {
        pendingWritesRef.current.push(data);
        return;
      }
      inject(`window.__traceWrite && window.__traceWrite(${JSON.stringify(data)});`);
    },
    [inject, webReady],
  );

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
      try {
        setStatus("loading");
        setMessage(null);

        let nextTerminalId: string | null = null;
        if (!forceNew) {
          const result = await getClient()
            .query<{ sessionTerminals: Terminal[] }>(SESSION_TERMINALS_QUERY, { sessionId })
            .toPromise();
          const existing = result.data?.sessionTerminals?.find(
            (terminal) => terminal.sessionId === sessionId,
          );
          nextTerminalId = existing?.id ?? null;
        }

        if (!nextTerminalId) {
          nextTerminalId = await createTerminal();
        }

        attachSocket(nextTerminalId);
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Couldn't open terminal");
      }
    },
    [attachSocket, createTerminal, sessionId],
  );

  useEffect(() => {
    setWebReady(false);
    pendingWritesRef.current = [];
    needsClearRef.current = true;
    void ensureTerminal();
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [ensureTerminal]);

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

  const handleWebMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const message = JSON.parse(event.nativeEvent.data) as
          | { type: "ready" }
          | { type: "bootstrap_error" }
          | { type: "input"; data: string }
          | { type: "resize"; cols: number; rows: number };

        if (message.type === "ready") {
          setWebReady(true);
          return;
        }
        if (message.type === "bootstrap_error") {
          setStatus("error");
          setMessage("Couldn't load the terminal runtime");
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
          onPress={() => {
            void ensureTerminal(true);
          }}
        />
      </View>

      <View style={[styles.surface, { backgroundColor: theme.colors.surfaceDeep }]}>
        <WebView
          ref={webViewRef}
          originWhitelist={["*"]}
          source={{ html: terminalHtml }}
          onMessage={handleWebMessage}
          style={styles.webView}
          scrollEnabled={false}
          bounces={false}
        />

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
