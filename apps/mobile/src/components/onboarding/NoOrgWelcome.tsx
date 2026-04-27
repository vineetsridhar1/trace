import { useEffect, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { StyleSheet, View } from "react-native";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { Button, Text } from "@/components/design-system";
import { handleMobileSignOut } from "@/lib/auth";
import { useTheme } from "@/theme";
import { CreateOrganizationForm } from "@/components/settings/CreateOrganizationForm";

export function NoOrgWelcome() {
  const theme = useTheme();
  const user = useAuthStore((s: AuthState) => s.user);
  const fetchMe = useAuthStore((s: AuthState) => s.fetchMe);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const email = user?.email ?? "";

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  async function handleCheckAgain() {
    setChecking(true);
    try {
      await fetchMe();
    } finally {
      setChecking(false);
    }
  }

  async function handleCopy() {
    if (!email) return;
    try {
      await Clipboard.setStringAsync(email);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures so the screen stays usable.
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.surfaceDeep }]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.xl,
          },
        ]}
      >
        <Text variant="title2" color="foreground">
          Welcome to Trace
        </Text>
        <Text variant="footnote" color="mutedForeground" style={styles.message}>
          Create an organization to start your own workspace, or ask an admin to invite you and
          share the email below.
        </Text>

        <View style={styles.createBlock}>
          <CreateOrganizationForm />
        </View>

        <View style={styles.emailBlock}>
          <Text variant="caption1" color="dimForeground" style={styles.emailLabel}>
            YOUR EMAIL
          </Text>
          <View
            style={[
              styles.emailRow,
              {
                backgroundColor: theme.colors.surfaceDeep,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
              },
            ]}
          >
            <Text variant="callout" color="foreground" numberOfLines={1} style={styles.emailValue}>
              {email}
            </Text>
            <Button
              title={copied ? "Copied" : "Copy"}
              onPress={handleCopy}
              variant="ghost"
              size="sm"
              disabled={!email}
            />
          </View>
        </View>

        <View style={styles.actions}>
          <Button
            title={checking ? "Checking..." : "Check again"}
            onPress={handleCheckAgain}
            loading={checking}
            size="md"
          />
          <Button
            title="Sign out"
            onPress={() => {
              void handleMobileSignOut();
            }}
            variant="ghost"
            size="md"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
  },
  message: {
    marginTop: 8,
  },
  emailBlock: {
    marginTop: 20,
    gap: 8,
  },
  createBlock: {
    marginTop: 24,
  },
  emailLabel: {
    letterSpacing: 0.8,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
  },
  emailValue: {
    flex: 1,
  },
  actions: {
    marginTop: 24,
    gap: 12,
  },
});
