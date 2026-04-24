import { StyleSheet, View } from "react-native";
import { SessionTerminalPanel } from "@/components/sessions/SessionTerminalPanel";
import { useSessionPageContext } from "@/components/sessions/session-page/SessionPageContext";

export default function SessionTerminalTabScreen() {
  const { overlayHeight, sessionId } = useSessionPageContext();

  return (
    <View style={[styles.root, { paddingTop: overlayHeight }]}>
      <SessionTerminalPanel sessionId={sessionId} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
});
