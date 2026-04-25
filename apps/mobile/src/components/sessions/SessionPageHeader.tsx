import { useCallback } from "react";
import { Pressable, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { SymbolView } from "expo-symbols";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";
import { SessionGroupHeader } from "./SessionGroupHeader";

interface SessionPageHeaderProps {
  groupId: string;
  sessionId: string;
  activePane?: "session" | "terminal" | "browser";
  browserEnabled?: boolean;
  onOpenBrowser?: () => void;
  onBack: () => void;
}

const TRIGGER_SIZE = 48;

export function SessionPageHeader({
  groupId,
  sessionId,
  activePane = "session",
  browserEnabled = true,
  onOpenBrowser,
  onBack,
}: SessionPageHeaderProps) {
  const theme = useTheme();
  const handleBack = useCallback(() => {
    void haptic.light();
    onBack();
  }, [onBack]);

  return (
    <SessionGroupHeader
      groupId={groupId}
      sessionId={sessionId}
      activePane={activePane}
      browserEnabled={browserEnabled}
      onOpenBrowser={onOpenBrowser}
      leadingAccessory={
        isLiquidGlassAvailable() ? (
          <GlassView
            glassEffectStyle="regular"
            isInteractive
            colorScheme={theme.scheme === "dark" ? "dark" : "light"}
            style={styles.backGlass}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={handleBack}
              style={styles.backButton}
            >
              <SymbolView
                name="chevron.left"
                size={18}
                tintColor={theme.colors.foreground}
                weight="semibold"
                resizeMode="scaleAspectFit"
                style={styles.icon}
              />
            </Pressable>
          </GlassView>
        ) : (
          <BlurView
            tint={theme.scheme === "dark" ? "systemThinMaterialDark" : "systemThinMaterial"}
            intensity={60}
            style={styles.backGlass}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={handleBack}
              style={styles.backButton}
            >
              <SymbolView
                name="chevron.left"
                size={18}
                tintColor={theme.colors.foreground}
                weight="semibold"
                resizeMode="scaleAspectFit"
                style={styles.icon}
              />
            </Pressable>
          </BlurView>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  backGlass: {
    width: TRIGGER_SIZE,
    height: TRIGGER_SIZE,
    borderRadius: TRIGGER_SIZE / 2,
    overflow: "hidden",
  },
  backButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  icon: {
    width: 18,
    height: 18,
  },
});
