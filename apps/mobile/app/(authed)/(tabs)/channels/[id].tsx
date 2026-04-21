// DIAGNOSTIC: this file has been temporarily reshaped to be a near-exact
// clone of (home)/index.tsx (simple ScrollView + filler rows) so we can
// tell whether the tab-bar minimize failure on pushed channel detail
// screens is caused by the detail's actual content (segmented control,
// RefreshControl, LayoutAnimationConfig wrapper, etc.) or by the push
// scenario itself (stack push + iOS 26 tabBarMinimizeBehavior).
// Revert via: git checkout HEAD~1 -- "apps/mobile/app/(authed)/channels/[id].tsx"
import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useEntityField } from "@trace/client-core";

export default function ChannelDetail() {
  const { id: channelId } = useLocalSearchParams<{ id: string }>();
  const channelName = useEntityField("channels", channelId, "name");

  return (
    <>
      <Stack.Screen options={{ title: channelName ?? "Channel" }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text style={styles.heading}>Detail (diagnostic)</Text>
        {Array.from({ length: 30 }).map((_, i) => (
          <View key={i} style={styles.filler}>
            <Text style={styles.fillerText}>Scroll filler row {i + 1}</Text>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#000",
  },
  container: {
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 160,
  },
  filler: {
    alignSelf: "stretch",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222",
  },
  fillerText: {
    color: "#888",
    fontSize: 14,
  },
  heading: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "600",
  },
});
