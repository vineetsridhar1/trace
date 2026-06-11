import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { gql } from "@urql/core";
import { SymbolView } from "expo-symbols";
import { Button, ListRow, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";

const API_TOKENS_QUERY = gql`
  query MobileMyApiTokens {
    myApiTokens {
      provider
      isSet
      updatedAt
    }
  }
`;

const SET_API_TOKEN_MUTATION = gql`
  mutation MobileSetApiToken($input: SetApiTokenInput!) {
    setApiToken(input: $input) {
      provider
      isSet
      updatedAt
    }
  }
`;

const DELETE_API_TOKEN_MUTATION = gql`
  mutation MobileDeleteApiToken($provider: ApiTokenProvider!) {
    deleteApiToken(provider: $provider)
  }
`;

type ApiTokenProviderValue = "github" | "codex_access_token";

interface TokenStatus {
  provider: ApiTokenProviderValue;
  isSet: boolean;
  updatedAt: string | null;
}

const PROVIDERS: readonly {
  provider: ApiTokenProviderValue;
  label: string;
  description: string;
  placeholder: string;
}[] = [
  {
    provider: "github",
    label: "GitHub",
    description: "Used for repository files, diffs, webhooks, and PR workflows.",
    placeholder: "ghp_...",
  },
  {
    provider: "codex_access_token",
    label: "Codex",
    description: "Used to authenticate Codex cloud sessions with ChatGPT workspace access.",
    placeholder: "Codex access token",
  },
];

type QueryData = { myApiTokens?: TokenStatus[] | null };
type SetData = { setApiToken?: TokenStatus | null };

function Section({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.section,
        {
          backgroundColor: theme.colors.surfaceElevated,
          borderColor: theme.colors.borderMuted,
          borderRadius: theme.radius.lg,
        },
      ]}
    >
      {children}
    </View>
  );
}

export function ApiTokensSheetContent() {
  const theme = useTheme();
  const [tokens, setTokens] = useState<TokenStatus[]>([]);
  const [editing, setEditing] = useState<ApiTokenProviderValue | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [savingProvider, setSavingProvider] = useState<ApiTokenProviderValue | null>(null);

  const tokenByProvider = useMemo(() => {
    return new Map(tokens.map((token) => [token.provider, token]));
  }, [tokens]);

  const fetchTokens = useCallback(async () => {
    const result = await getClient().query<QueryData>(API_TOKENS_QUERY, {}).toPromise();
    if (result.error) {
      console.warn("[api-tokens] query failed", result.error);
      return;
    }
    setTokens(result.data?.myApiTokens ?? []);
  }, []);

  useEffect(() => {
    void fetchTokens();
  }, [fetchTokens]);

  async function saveToken(provider: ApiTokenProviderValue) {
    const token = inputValue.trim();
    if (!token || savingProvider) return;
    setSavingProvider(provider);
    try {
      const result = await getClient()
        .mutation<SetData>(SET_API_TOKEN_MUTATION, {
          input: { provider, token },
        })
        .toPromise();
      if (result.error) throw result.error;
      if (result.data?.setApiToken) {
        setTokens((current) => [
          ...current.filter((item) => item.provider !== provider),
          result.data!.setApiToken!,
        ]);
      } else {
        await fetchTokens();
      }
      setEditing(null);
      setInputValue("");
      void haptic.success();
    } catch (error) {
      void haptic.error();
      Alert.alert("Couldn't save token", error instanceof Error ? error.message : "Try again.");
    } finally {
      setSavingProvider(null);
    }
  }

  async function deleteToken(provider: ApiTokenProviderValue) {
    if (savingProvider) return;
    setSavingProvider(provider);
    try {
      const result = await getClient()
        .mutation(DELETE_API_TOKEN_MUTATION, { provider })
        .toPromise();
      if (result.error) throw result.error;
      setTokens((current) =>
        current.map((item) =>
          item.provider === provider ? { ...item, isSet: false, updatedAt: null } : item,
        ),
      );
      void haptic.success();
    } catch (error) {
      void haptic.error();
      Alert.alert("Couldn't delete token", error instanceof Error ? error.message : "Try again.");
    } finally {
      setSavingProvider(null);
    }
  }

  function confirmDelete(provider: ApiTokenProviderValue, label: string) {
    Alert.alert(`Delete ${label} token?`, "Trace will stop using this token immediately.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void deleteToken(provider) },
    ]);
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { padding: theme.spacing.lg }]}
    >
      <View style={styles.header}>
        <Text variant="headline">API keys</Text>
        <Text variant="footnote" color="mutedForeground">
          Tokens are encrypted and used only for integrations that need them.
        </Text>
      </View>

      <Section>
        {PROVIDERS.map((meta, index) => {
          const token = tokenByProvider.get(meta.provider);
          const isEditing = editing === meta.provider;
          const saving = savingProvider === meta.provider;
          return (
            <View key={meta.provider}>
              <ListRow
                title={meta.label}
                subtitle={token?.isSet ? "Configured" : meta.description}
                leading={
                  <SymbolView
                    name={token?.isSet ? "checkmark.seal" : "key"}
                    size={18}
                    tintColor={token?.isSet ? theme.colors.success : theme.colors.mutedForeground}
                  />
                }
                trailing={
                  <SymbolView
                    name={isEditing ? "chevron.down" : "chevron.right"}
                    size={14}
                    tintColor={theme.colors.dimForeground}
                  />
                }
                onPress={() => {
                  setEditing(isEditing ? null : meta.provider);
                  setInputValue("");
                }}
                separator={isEditing || index < PROVIDERS.length - 1}
              />
              {isEditing ? (
                <View
                  style={[
                    styles.editor,
                    {
                      borderBottomWidth:
                        index < PROVIDERS.length - 1 ? StyleSheet.hairlineWidth : 0,
                      borderBottomColor: theme.colors.border,
                    },
                  ]}
                >
                  <TextInput
                    value={inputValue}
                    onChangeText={setInputValue}
                    placeholder={meta.placeholder}
                    placeholderTextColor={theme.colors.dimForeground}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!saving}
                    style={[
                      styles.input,
                      {
                        color: theme.colors.foreground,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surface,
                        borderRadius: theme.radius.md,
                      },
                    ]}
                  />
                  <View style={styles.buttonRow}>
                    {token?.isSet ? (
                      <Button
                        title="Delete"
                        variant="destructive"
                        size="sm"
                        disabled={saving}
                        onPress={() => confirmDelete(meta.provider, meta.label)}
                      />
                    ) : null}
                    <Button
                      title={token?.isSet ? "Replace" : "Save"}
                      size="sm"
                      disabled={!inputValue.trim()}
                      loading={saving}
                      onPress={() => void saveToken(meta.provider)}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 32,
  },
  header: {
    gap: 4,
  },
  section: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  editor: {
    gap: 12,
    padding: 16,
  },
  input: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
});
