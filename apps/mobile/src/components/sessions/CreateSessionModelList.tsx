import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { getModelsForTool, type ModelOption } from "@trace/shared";
import { ListRow } from "@/components/design-system";
import { useTheme } from "@/theme";

export interface CreateSessionModelListProps {
  tool: string;
  selectedModel: string | undefined;
  onSelect: (model: string) => void;
}

export function CreateSessionModelList({
  tool,
  selectedModel,
  onSelect,
}: CreateSessionModelListProps) {
  const theme = useTheme();
  const models = getModelsForTool(tool);

  return (
    <View
      style={[
        styles.list,
        {
          backgroundColor: theme.colors.surfaceElevated,
          borderColor: theme.colors.borderMuted,
          borderRadius: theme.radius.lg,
        },
      ]}
    >
      {models.map((model: ModelOption, index: number) => {
        const active = model.value === selectedModel;
        return (
          <ListRow
            key={model.value}
            title={model.label}
            trailing={
              active ? (
                <SymbolView
                  name="checkmark"
                  size={16}
                  tintColor={theme.colors.accent}
                />
              ) : undefined
            }
            onPress={() => onSelect(model.value)}
            haptic={active ? "none" : "selection"}
            separator={index < models.length - 1}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
});
