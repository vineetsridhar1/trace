import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { Text } from "@/components/design-system";

export const TIMESTAMP_REVEAL_DISTANCE = 72;

interface TimestampRevealRowProps {
  children: ReactNode;
  paddingHorizontal: number;
  revealX: SharedValue<number>;
  timestampLabel?: string | null;
}

export function TimestampRevealRow({
  children,
  paddingHorizontal,
  revealX,
  timestampLabel,
}: TimestampRevealRowProps) {
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -revealX.value }],
  }));
  const timestampStyle = useAnimatedStyle(() => ({
    opacity: timestampLabel
      ? interpolate(
          revealX.value,
          [0, TIMESTAMP_REVEAL_DISTANCE * 0.45],
          [0, 1],
          Extrapolation.CLAMP,
        )
      : 0,
    transform: [
      {
        translateX: interpolate(
          revealX.value,
          [0, TIMESTAMP_REVEAL_DISTANCE],
          [12, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <View style={[styles.row, { paddingHorizontal }]}>
      {timestampLabel ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.timestampReveal,
            { right: paddingHorizontal },
            timestampStyle,
          ]}
        >
          <Text variant="caption2" color="dimForeground">
            {timestampLabel}
          </Text>
        </Animated.View>
      ) : null}
      <Animated.View style={contentStyle}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 6 },
  timestampReveal: {
    position: "absolute",
    top: 6,
    bottom: 6,
    width: TIMESTAMP_REVEAL_DISTANCE,
    alignItems: "flex-end",
    justifyContent: "center",
  },
});
