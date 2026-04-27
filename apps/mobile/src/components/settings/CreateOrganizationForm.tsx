import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import { Button, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient, recreateClient } from "@/lib/urql";
import { useMobileUIStore } from "@/stores/ui";
import { useTheme } from "@/theme";

const CREATE_ORGANIZATION = `
  mutation MobileCreateOrganization($input: CreateOrganizationInput!) {
    createOrganization(input: $input) {
      organization {
        id
        name
      }
    }
  }
`;

type CreatedOrgMembership = {
  organization: {
    id: string;
  };
};

interface CreateOrganizationFormProps {
  onCreated?: () => void;
}

export function CreateOrganizationForm({ onCreated }: CreateOrganizationFormProps) {
  const theme = useTheme();
  const fetchMe = useAuthStore((s: AuthState) => s.fetchMe);
  const setActiveOrg = useAuthStore((s: AuthState) => s.setActiveOrg);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter an organization name.");
      void haptic.error();
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await getClient()
        .mutation(CREATE_ORGANIZATION, { input: { name: trimmedName } })
        .toPromise();

      if (result.error) {
        setError(result.error.message);
        void haptic.error();
        return;
      }

      const membership = result.data?.createOrganization as CreatedOrgMembership | undefined;
      await fetchMe();
      if (membership?.organization.id) {
        setActiveOrg(membership.organization.id);
        recreateClient();
        useEntityStore.getState().reset();
        useMobileUIStore.getState().reset();
      }
      setName("");
      void haptic.success();
      onCreated?.();
    } catch (err) {
      console.error("[organization] create failed", err);
      setError("Could not create the organization. Please try again.");
      void haptic.error();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.inputShell,
          {
            backgroundColor: theme.colors.surface,
            borderColor: error ? theme.colors.destructive : theme.colors.borderMuted,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Organization name"
          placeholderTextColor={theme.colors.dimForeground}
          autoCapitalize="words"
          autoCorrect={false}
          editable={!submitting}
          returnKeyType="done"
          onSubmitEditing={handleCreate}
          style={[
            styles.input,
            {
              color: theme.colors.foreground,
            },
          ]}
        />
      </View>
      {error ? (
        <Text variant="footnote" color="destructive">
          {error}
        </Text>
      ) : null}
      <Button
        title={submitting ? "Creating..." : "Create organization"}
        onPress={handleCreate}
        loading={submitting}
        disabled={submitting}
        size="md"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  inputShell: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
});
