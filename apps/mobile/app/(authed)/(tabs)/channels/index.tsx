// DIAGNOSTIC: this file has been temporarily reshaped to match
// apps/mobile/app/(authed)/(home)/index.tsx as closely as possible so we can
// tell whether the tab-bar minimize failure on the channels tab is caused by
// the screen's content shape (FlashList + SafeAreaView + search bar) or by
// something structural about the tab (Stack with multiple screens, etc).
// Revert via: git checkout HEAD -- apps/mobile/app/\(authed\)/channels/index.tsx
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function ChannelsIndex() {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={styles.heading}>Channels (diagnostic)</Text>
      {Array.from({ length: 30 }).map((_, i) => (
        <View key={i} style={styles.filler}>
          <Text style={styles.fillerText}>Scroll filler row {i + 1}</Text>
        </View>
      ))}
    </ScrollView>
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
