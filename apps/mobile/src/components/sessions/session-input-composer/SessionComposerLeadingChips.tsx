import { Pressable, View } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import type { CodingTool } from "@trace/gql";
import { Glass } from "@/components/design-system";
import { ComposerMorphPill, type ComposerMorphPillItem } from "@/components/sessions/ComposerMorphPill";
import type { ComposerMode } from "@/hooks/useComposerSubmit";
import { MODE_ICON, MODE_LABEL } from "./constants";
import { SessionComposerToolLogo } from "./SessionComposerToolLogo";
import { styles } from "./styles";
import type {
  ComposerAnimatedTextStyle,
  ComposerAnimatedViewStyle,
  ComposerGlassAnimatedProps,
} from "./types";

const AnimatedGlass = Animated.createAnimatedComponent(Glass);

interface SessionComposerLeadingChipsProps {
  expanded: boolean;
  chipsVisible: boolean;
  canInteract: boolean;
  currentTool: CodingTool;
  mode: ComposerMode;
  modeIconTint: string;
  modeLabelVisible: boolean;
  modelItems: ComposerMorphPillItem[];
  modelLabel: string;
  modelLabelVisible: boolean;
  toolHeaderItems: ComposerMorphPillItem[];
  chipAnimatedStyle: ComposerAnimatedViewStyle;
  chipTextAnimatedStyle: ComposerAnimatedTextStyle;
  glassAnimatedProps: ComposerGlassAnimatedProps;
  leadingChipsAnimatedStyle: ComposerAnimatedViewStyle;
  modeWidthAnimatedStyle: ComposerAnimatedViewStyle;
  modelWidthAnimatedStyle: ComposerAnimatedViewStyle;
  onModePress: () => void;
  onModelChipPress: () => void;
  onModelMenuOpenChange: (open: boolean) => void;
  onModelTouchStart: () => void;
}

export function SessionComposerLeadingChips({
  expanded,
  chipsVisible,
  canInteract,
  currentTool,
  mode,
  modeIconTint,
  modeLabelVisible,
  modelItems,
  modelLabel,
  modelLabelVisible,
  toolHeaderItems,
  chipAnimatedStyle,
  chipTextAnimatedStyle,
  glassAnimatedProps,
  leadingChipsAnimatedStyle,
  modeWidthAnimatedStyle,
  modelWidthAnimatedStyle,
  onModePress,
  onModelChipPress,
  onModelMenuOpenChange,
  onModelTouchStart,
}: SessionComposerLeadingChipsProps) {
  if (!expanded) return null;

  return (
    <Animated.View
      pointerEvents={chipsVisible ? "auto" : "none"}
      style={[
        styles.leadingChipsContainer,
        chipsVisible ? styles.leadingChipsVisible : styles.leadingChipsHidden,
        leadingChipsAnimatedStyle,
      ]}
    >
      <View style={styles.leadingChipsRow}>
        <Animated.View style={[styles.modeChipSlot, modeWidthAnimatedStyle]}>
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
                style={[
                  styles.modeChip,
                  chipAnimatedStyle,
                ]}
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

        <Animated.View style={[styles.modelChipSlot, modelWidthAnimatedStyle]}>
          {modelLabelVisible ? (
            <Animated.View
              key="model-expanded"
              onTouchStart={onModelTouchStart}
              style={styles.modelExpandedWrapper}
            >
              <ComposerMorphPill
                label={modelLabel}
                accessibilityLabel="Model"
                disabled={!canInteract}
                headerItems={toolHeaderItems}
                items={modelItems}
                minWidth={0}
                tintAnimatedProps={glassAnimatedProps}
                onOpenChange={onModelMenuOpenChange}
              />
            </Animated.View>
          ) : (
            <Animated.View
              key="model-collapsed"
              style={styles.modelChipCollapsedWrapper}
            >
              <AnimatedGlass
                preset="input"
                animatedProps={glassAnimatedProps}
                interactive
                style={[styles.modelChipCollapsed, chipAnimatedStyle]}
              >
                <Pressable
                  onPress={onModelChipPress}
                  disabled={!canInteract}
                  accessibilityRole="button"
                  accessibilityLabel={`Model: ${modelLabel}. Tap to reveal.`}
                  style={({ pressed }) => [
                    styles.modelChipPressable,
                    { opacity: canInteract ? (pressed ? 0.78 : 1) : 0.4 },
                  ]}
                >
                  <SessionComposerToolLogo tool={currentTool} size={22} />
                </Pressable>
              </AnimatedGlass>
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </Animated.View>
  );
}
