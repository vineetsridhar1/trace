import type { ReactNode } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { StatusBar, type StatusBarStyle } from "expo-status-bar";
import { useTheme, type Theme } from "@/theme";

export interface ScreenProps {
  children: ReactNode;
  edges?: Edge[];
  background?: keyof Theme["colors"];
  statusBarStyle?: StatusBarStyle;
  style?: ViewStyle;
}

const DEFAULT_EDGES: Edge[] = ["top", "bottom", "left", "right"];

export function Screen({
  children,
  edges = DEFAULT_EDGES,
  background = "background",
  statusBarStyle = "light",
  style,
}: ScreenProps) {
  const theme = useTheme();
  return (
    <>
      <StatusBar style={statusBarStyle} />
      <SafeAreaView
        edges={edges}
        style={[
          styles.root,
          { backgroundColor: theme.colors[background] },
          style,
        ]}
      >
        {children}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
