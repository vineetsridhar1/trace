import { useCallback } from "react";
import { Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { SymbolView } from "expo-symbols";
import { useSessionGroupSessionIds } from "@/hooks/useSessionGroupDetail";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";
import { SessionGroupHeader } from "./SessionGroupHeader";

interface SessionPageHeaderProps {
  groupId: string;
  sessionId: string;
  onBack: () => void;
}

const TRIGGER_SIZE = 48;

export function SessionPageHeader({
  groupId,
  sessionId,
  onBack,
}: SessionPageHeaderProps) {
  const router = useRouter();
  const theme = useTheme();
  const sessionIds = useSessionGroupSessionIds(groupId);
  const handleBack = useCallback(() => {
    void haptic.light();
    onBack();
  }, [onBack]);
  const handleOpenTabSwitcher = useCallback(() => {
    void haptic.light();
    router.push(
      `/sheets/session-tabs?groupId=${encodeURIComponent(groupId)}&sessionId=${encodeURIComponent(sessionId)}` as never,
    );
  }, [groupId, router, sessionId]);
  const showTabSwitcher = sessionIds.length > 1;

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
      trailingAccessory={
        showTabSwitcher ? (
          isLiquidGlassAvailable() ? (
            <GlassView
              glassEffectStyle="regular"
              isInteractive
              colorScheme={theme.scheme === "dark" ? "dark" : "light"}
              style={styles.accessoryGlass}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Switch agent tabs"
                hitSlop={8}
                onPress={handleOpenTabSwitcher}
                style={styles.accessoryButton}
              >
                <SymbolView
                  name="rectangle.on.rectangle"
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
              style={styles.accessoryGlass}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Switch agent tabs"
                hitSlop={8}
                onPress={handleOpenTabSwitcher}
                style={styles.accessoryButton}
              >
                <SymbolView
                  name="rectangle.on.rectangle"
                  size={18}
                  tintColor={theme.colors.foreground}
                  weight="semibold"
                  resizeMode="scaleAspectFit"
                  style={styles.icon}
                />
              </Pressable>
            </BlurView>
          )
        ) : null
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
  accessoryGlass: {
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
  accessoryButton: {
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
