import { useAuthStore } from "@trace/client-core";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function Index() {
  useEffect(() => {
    useAuthStore
      .getState()
      .fetchMe()
      .then(() => {
        const { user, orgMemberships } = useAuthStore.getState();
        console.log("[trace] fetchMe result:", { user, orgMemberships });
      })
      .catch((err) => {
        console.error("[trace] fetchMe failed:", err);
      });
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Trace Mobile</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
  },
  text: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
  },
});
