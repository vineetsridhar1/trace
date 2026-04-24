import { StyleSheet, View } from "react-native";
import { BrowserPanel } from "@/components/sessions/BrowserPanel";
import { useSessionPageContext } from "@/components/sessions/session-page/SessionPageContext";

export default function SessionBrowserTabScreen() {
  const { onBrowserUrlChange, overlayHeight, resolvedBrowserUrl } = useSessionPageContext();

  return (
    <View style={styles.root}>
      <BrowserPanel
        url={resolvedBrowserUrl}
        onUrlChange={onBrowserUrlChange}
        topInset={overlayHeight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
});
