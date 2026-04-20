import { View } from "react-native";
import { Sheet, Text, Button } from "@/components/design-system";
import { useRouter } from "expo-router";

export default function SheetPreview() {
  const router = useRouter();
  return (
    <Sheet detents={["medium", "large"]} showGrabber>
      <View style={{ gap: 12 }}>
        <Text variant="headline">Sheet Preview</Text>
        <Text variant="body" color="mutedForeground">
          Medium + large detents, grab bar, swipe-to-dismiss enabled.
        </Text>
        <Button title="Close" variant="secondary" onPress={() => router.back()} />
      </View>
    </Sheet>
  );
}
