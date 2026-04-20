import { View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Sheet, Text } from "@/components/design-system";
import { useTheme } from "@/theme";

export default function Ticket12SheetDemo() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <Sheet detents={["small", "medium", "large"]} showGrabber>
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="title2">Sheet demo</Text>
        <Text variant="body" color="mutedForeground">
          Drag the grabber to switch detents (small ≈ 35%, medium = 50%, large = 100%).
          Swipe down to dismiss.
        </Text>
        <Button title="Close" onPress={() => router.back()} variant="secondary" />
      </View>
    </Sheet>
  );
}
