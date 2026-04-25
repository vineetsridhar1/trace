import { memo } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Glass } from "@/components/design-system";
import { useTheme } from "@/theme";

export interface ChannelSearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
}

export const ChannelSearchField = memo(function ChannelSearchField({
  value,
  onChangeText,
}: ChannelSearchFieldProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.background,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.md,
        },
      ]}
    >
      <Glass preset="input" style={styles.glass}>
        <View style={styles.row}>
          <SymbolView
            name="magnifyingglass"
            size={16}
            tintColor={theme.colors.mutedForeground}
            style={styles.icon}
          />
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder="Search channels"
            placeholderTextColor={theme.colors.dimForeground}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
            selectionColor={theme.colors.accent}
            style={[
              styles.input,
              {
                color: theme.colors.foreground,
              },
            ]}
          />
        </View>
      </Glass>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  glass: {
    minHeight: 52,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    fontSize: 17,
  },
});
