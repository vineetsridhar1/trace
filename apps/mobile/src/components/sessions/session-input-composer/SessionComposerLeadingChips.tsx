import { Pressable, View } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideOutLeft } from "react-native-reanimated";
import type { CodingTool } from "@trace/gql";
import { Glass } from "@/components/design-system";
import type { ComposerMode } from "@/hooks/useComposerSubmit";
import { MODE_ICON, MODE_LABEL } from "./constants";
import { SessionComposerModelTrigger } from "./SessionComposerModelTrigger";
import { styles } from "./styles";
import type {
  ComposerAnimatedTextStyle,
  ComposerAnimatedViewStyle,
  ComposerGlassAnimatedProps,
} from "./types";

const AnimatedGlass = Animated.createAnimatedComponent(Glass);

interface SessionComposerLeadingChipsProps {
  canInteract: boolean;
  currentTool: CodingTool;
  mode: ComposerMode;
  modeIconTint: string;
  modeLabelVisible: boolean;
  modelLabel: string;
  showModeChip: boolean;
  chipAnimatedStyle: ComposerAnimatedViewStyle;
  chipTextAnimatedStyle: ComposerAnimatedTextStyle;
  glassAnimatedProps: ComposerGlassAnimatedProps;
  modeWidthAnimatedStyle: ComposerAnimatedViewStyle;
  onModePress: () => void;
  onOpenModelSheet: () => void;
}

export function SessionComposerLeadingChips({
  canInteract,
  currentTool,
  mode,
  modeIconTint,
  modeLabelVisible,
  modelLabel,
  showModeChip,
  chipAnimatedStyle,
  chipTextAnimatedStyle,
  glassAnimatedProps,
  modeWidthAnimatedStyle,
  onModePress,
  onOpenModelSheet,
}: SessionComposerLeadingChipsProps) {
  return (
    <View style={styles.leadingChipsContainer}>
      <View style={styles.leadingChipsRow}>
        {showModeChip ? (
          <Animated.View
            entering={SlideInLeft.duration(300)}
            exiting={SlideOutLeft.duration(300)}
            style={[styles.modeChipSlot, modeWidthAnimatedStyle]}
          >
            <Pressable
              onPress={onModePress}
              disabled={!canInteract}
              accessibilityRole="button"
              accessibilityLabel={
                modeLabelVisible
                  ? `Interaction mode: ${MODE_LABEL[mode]}. Tap to cycle.`
                  : `Interaction mode: ${MODE_LABEL[mode]}. Tap to reveal.`
              }
              hitSlop={8}
              style={styles.modeChipPressable}
            >
              {({ pressed }) => (
                <AnimatedGlass
                  preset="input"
                  animatedProps={glassAnimatedProps}
                  interactive
                  style={[styles.modeChip, chipAnimatedStyle]}
                >
                  <View
                    style={[
                      styles.modeChipContent,
                      { opacity: canInteract ? (pressed ? 0.78 : 1) : 0.45 },
                    ]}
                  >
                    <SymbolView
                      name={MODE_ICON[mode]}
                      size={16}
                      tintColor={modeIconTint}
                      weight="medium"
                      resizeMode="scaleAspectFit"
                      style={styles.modeChipIcon}
                    />
                    {modeLabelVisible ? (
                      <Animated.Text
                        entering={FadeIn.duration(140)}
                        exiting={FadeOut.duration(100)}
                        numberOfLines={1}
                        style={[styles.modeText, chipTextAnimatedStyle]}
                      >
                        {MODE_LABEL[mode]}
                      </Animated.Text>
                    ) : null}
                  </View>
                </AnimatedGlass>
              )}
            </Pressable>
          </Animated.View>
        ) : null}

        <View style={styles.modelChipSlot}>
          <SessionComposerModelTrigger
            canInteract={canInteract}
            currentTool={currentTool}
            modelLabel={modelLabel}
            onOpenModelSheet={onOpenModelSheet}
            showLabel={false}
          />
        </View>
      </View>
    </View>
  );
}
