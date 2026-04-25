import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

interface SessionBrowserBackGestureProps {
  onBack: () => void;
}

const EDGE_WIDTH = 24;
const CLOSE_DISTANCE = 72;
const CLOSE_VELOCITY = 700;

export function SessionBrowserBackGesture({ onBack }: SessionBrowserBackGestureProps) {
  const edgeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(18)
        .failOffsetY([-24, 24])
        .onEnd((event) => {
          const shouldClose =
            event.translationX > CLOSE_DISTANCE || event.velocityX > CLOSE_VELOCITY;
          if (!shouldClose) return;
          runOnJS(onBack)();
        }),
    [onBack],
  );

  return (
    <GestureDetector gesture={edgeGesture}>
      <View pointerEvents="box-only" style={styles.edge} />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  edge: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: EDGE_WIDTH,
    zIndex: 20,
  },
});
