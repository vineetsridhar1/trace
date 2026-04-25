import { useCallback, useState, type ComponentProps, type RefObject } from "react";
import {
  Text as NativeText,
  Pressable,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from "react-native";
import Animated from "react-native-reanimated";
import { Glass, Text } from "@/components/design-system";
import { useTheme } from "@/theme";
import { styles } from "./styles";
import type { ComposerAnimatedViewStyle, ComposerGlassAnimatedProps } from "./types";
import type { ComposerSelection } from "@/lib/slashCommands";

const AnimatedGlass = Animated.createAnimatedComponent(Glass);

interface SessionComposerInputCardProps {
  canInteract: boolean;
  errorDraft: string | null;
  errorMessage: string | null;
  glassAnimatedProps: ComposerGlassAnimatedProps;
  inputHeight: number;
  inputAnimatedStyle: ComposerAnimatedViewStyle;
  inputRef: RefObject<TextInput | null>;
  layoutTransition?: ComponentProps<typeof Animated.View>["layout"];
  placeholder: string;
  selection: ComposerSelection;
  text: string;
  cardBorderAnimatedStyle: ComposerAnimatedViewStyle;
  onBlur: () => void;
  onChangeText: (text: string) => void;
  onContentHeightChange: (height: number) => void;
  onFocus: () => void;
  onSelectionChange: (selection: ComposerSelection) => void;
  onRetry: () => void;
}

export function SessionComposerInputCard({
  canInteract,
  errorDraft,
  errorMessage,
  glassAnimatedProps,
  inputHeight,
  inputAnimatedStyle,
  inputRef,
  layoutTransition,
  placeholder,
  selection,
  text,
  cardBorderAnimatedStyle,
  onBlur,
  onChangeText,
  onContentHeightChange,
  onFocus,
  onSelectionChange,
  onRetry,
}: SessionComposerInputCardProps) {
  const theme = useTheme();
  const [inputWidth, setInputWidth] = useState(0);

  const handleSelectionChange = (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) => {
    onSelectionChange(event.nativeEvent.selection);
  };

  const handleInputLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setInputWidth((current) => (current === nextWidth ? current : nextWidth));
  }, []);

  const handleMeasureLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onContentHeightChange(event.nativeEvent.layout.height);
    },
    [onContentHeightChange],
  );

  return (
    <AnimatedGlass
      preset="input"
      animatedProps={glassAnimatedProps}
      interactive
      layout={layoutTransition}
      style={[styles.inputCard, cardBorderAnimatedStyle]}
    >
      {errorDraft ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry send"
          style={styles.retryRow}
        >
          <Text variant="caption1" style={{ color: theme.colors.destructive }}>
            {errorMessage ?? "Failed to send"}. Tap to retry.
          </Text>
        </Pressable>
      ) : null}

      <Animated.View onLayout={handleInputLayout} style={[styles.inputWrapper, inputAnimatedStyle]}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          onContentSizeChange={(event) =>
            onContentHeightChange(event.nativeEvent.contentSize.height)
          }
          onSelectionChange={handleSelectionChange}
          editable={canInteract}
          multiline
          scrollEnabled={false}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.dimForeground}
          selection={selection}
          style={[styles.input, { color: theme.colors.foreground, height: inputHeight }]}
        />
        {inputWidth > 0 ? (
          <View pointerEvents="none" style={styles.measureLayer}>
            <NativeText
              onLayout={handleMeasureLayout}
              style={[styles.inputMeasure, { color: theme.colors.foreground, width: inputWidth }]}
            >
              {text.length > 0 ? `${text} ` : " "}
            </NativeText>
          </View>
        ) : null}
      </Animated.View>
    </AnimatedGlass>
  );
}
