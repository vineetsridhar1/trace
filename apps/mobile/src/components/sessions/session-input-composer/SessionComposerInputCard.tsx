import type { RefObject } from "react";
import { Pressable, TextInput } from "react-native";
import Animated from "react-native-reanimated";
import { Glass, Text } from "@/components/design-system";
import { useTheme } from "@/theme";
import { styles } from "./styles";
import type {
  ComposerAnimatedViewStyle,
  ComposerGlassAnimatedProps,
} from "./types";

interface SessionComposerInputCardProps {
  canInteract: boolean;
  errorDraft: string | null;
  errorMessage: string | null;
  glassAnimatedProps: ComposerGlassAnimatedProps;
  inputAnimatedStyle: ComposerAnimatedViewStyle;
  inputRef: RefObject<TextInput | null>;
  placeholder: string;
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
  errorDraft,
  errorMessage,
  glassAnimatedProps,
  inputAnimatedStyle,
  inputRef,
  placeholder,
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
    <Glass
      preset="pinnedBar"
      animatedProps={glassAnimatedProps}
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

      <Animated.View style={[styles.inputWrapper, inputAnimatedStyle]}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          onContentSizeChange={(event) => onContentHeightChange(event.nativeEvent.contentSize.height)}
          editable={canInteract}
          multiline
          placeholder={placeholder}
          placeholderTextColor={theme.colors.dimForeground}
          style={[styles.input, { color: theme.colors.foreground }]}
        />
      </Animated.View>
    </Glass>
  );
}
