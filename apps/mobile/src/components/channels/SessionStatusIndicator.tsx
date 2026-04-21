import { useEffect } from "react";
import { View } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import type { SessionGroupStatus, SessionStatus } from "@trace/gql";
import { statusIndicatorColor } from "@/lib/sessionGroupStatus";
import { useTheme } from "@/theme";

export interface SessionStatusIndicatorProps {
  status: SessionGroupStatus | SessionStatus | null | undefined;
  /** Latest session's `agentStatus` — drives the spinner/X overlay. */
  agentStatus: string | null | undefined;
  size?: number;
}

type IndicatorKind = "dot" | "spinner" | "x";

function indicatorKind(
  status: SessionGroupStatus | SessionStatus | null | undefined,
  agentStatus: string | null | undefined,
): IndicatorKind {
  // Terminal display states force a static dot regardless of agent state —
  // matches web's `getDisplayAgentStatus` which collapses archived/stopped
  // back to a non-spinning indicator.
  if (status === "archived" || status === "stopped" || status === "merged") {
    return "dot";
  }
  if (status === "failed" || agentStatus === "failed") return "x";
  if (agentStatus === "active") return "spinner";
  return "dot";
}

export function SessionStatusIndicator({
  status,
  agentStatus,
  size = 10,
}: SessionStatusIndicatorProps) {
  const theme = useTheme();
  const color = statusIndicatorColor(theme, status);
  const kind = indicatorKind(status, agentStatus);

  if (kind === "x") {
    return (
      <SymbolView
        name="xmark.circle.fill"
        size={size + 2}
        tintColor={color}
        resizeMode="scaleAspectFit"
        style={{ width: size + 2, height: size + 2 }}
      />
    );
  }

  if (kind === "spinner") {
    return <SpinningRing size={size} color={color} />;
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
      }}
    />
  );
}

function SpinningRing({ size, color }: { size: number; color: string }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(rotation);
    };
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: color,
          // Missing-segment trick gives the rotating ring its sense of motion.
          borderTopColor: "transparent",
        },
        animatedStyle,
      ]}
    />
  );
}
