import type { RefObject } from "react";
import { Pressable, TextInput, View } from "react-native";
import Animated from "react-native-reanimated";
import { Glass, Text } from "@/components/design-system";
import { useTheme } from "@/theme";
import { styles } from "./styles";
import type {
  ComposerGlassAnimatedProps,
  ComposerAnimatedViewStyle,
} from "./types";

const AnimatedGlass = Animated.createAnimatedComponent(Glass);

interface SessionComposerInputCardProps {
  canInteract: boolean;
  cardMinHeight: number;
  errorDraft: string | null;
  errorMessage: string | null;
  glassAnimatedProps: ComposerGlassAnimatedProps;
  inputHeight: number;
  inputRef: RefObject<TextInput | null>;
  placeholder: string;
  scrollEnabled: boolean;
  text: string;
  cardBorderAnimatedStyle: ComposerAnimatedViewStyle;
  onBlur: () => void;
  onChangeText: (text: string) => void;
  onContentHeightChange: (height: number) => void;
  onFocus: () => void;
  onRetry: () => void;
}

export function SessionComposerInputCard({
  canInteract,
  cardMinHeight,
  errorDraft,
  errorMessage,
  glassAnimatedProps,
  inputHeight,
  inputRef,
  placeholder,
  scrollEnabled,
  text,
  cardBorderAnimatedStyle,
  onBlur,
  onChangeText,
  onContentHeightChange,
  onFocus,
  onRetry,
}: SessionComposerInputCardProps) {
  const theme = useTheme();

  return (
    <AnimatedGlass
      preset="input"
      animatedProps={glassAnimatedProps}
      interactive
      style={[styles.inputCard, { minHeight: cardMinHeight }, cardBorderAnimatedStyle]}
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

      <View style={[styles.inputWrapper, { minHeight: inputHeight }]}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          onContentSizeChange={(event) => onContentHeightChange(event.nativeEvent.contentSize.height)}
          editable={canInteract}
          multiline
          scrollEnabled={scrollEnabled}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.dimForeground}
          style={[
            styles.input,
            {
              color: theme.colors.foreground,
              minHeight: inputHeight,
            },
          ]}
        />
      </View>
    </AnimatedGlass>
  );
}
