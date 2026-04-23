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
  onBack: () => void;
}

export function SessionPageHeader({
  groupId,
  sessionId,
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
              style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
            >
              <SymbolView
                name="chevron.left"
                size={18}
                tintColor={theme.colors.foreground}
                weight="semibold"
              />
            </Pressable>
          </GlassView>
        ) : (
          <BlurView
            tint={theme.scheme === "dark" ? "systemThinMaterialDark" : "systemThinMaterial"}
            intensity={50}
            style={styles.backGlass}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={handleBack}
              style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
            >
              <SymbolView
                name="chevron.left"
                size={18}
                tintColor={theme.colors.foreground}
                weight="semibold"
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
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  backButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.72,
  },
});
