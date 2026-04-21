// DIAGNOSTIC (step 2): same filler content as the step-1 home-clone, but
// wrapped in RNALayoutAnimationConfig and carrying a `key` prop on the
// ScrollView, matching the real channels/[id].tsx outer shape.
// Revert via: git checkout HEAD~2 -- "apps/mobile/app/(authed)/channels/[id].tsx"
import { useCallback, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { LayoutAnimationConfig as RNALayoutAnimationConfig } from "react-native-reanimated";
import { useEntityField } from "@trace/client-core";

export default function ChannelDetail() {
  const { id: channelId } = useLocalSearchParams<{ id: string }>();
  const channelName = useEntityField("channels", channelId, "name");
  const [scope] = useState<"all" | "mine">("all");
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: channelName ?? "Channel" }} />
      <RNALayoutAnimationConfig skipEntering={true}>
        <ScrollView
          key={scope}
          style={styles.scroll}
          contentContainerStyle={styles.container}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          <Text style={styles.heading}>Detail step-3 diagnostic</Text>
          {Array.from({ length: 30 }).map((_, i) => (
            <View key={i} style={styles.filler}>
              <Text style={styles.fillerText}>Scroll filler row {i + 1}</Text>
            </View>
          ))}
        </ScrollView>
      </RNALayoutAnimationConfig>
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
