import type { RefObject } from "react";
import {
  Pressable,
  TextInput,
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
  inputAnimatedStyle: ComposerAnimatedViewStyle;
  inputRef: RefObject<TextInput | null>;
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
  inputAnimatedStyle,
  inputRef,
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

  const handleSelectionChange = (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) => {
    onSelectionChange(event.nativeEvent.selection);
  };

  return (
    <AnimatedGlass
      preset="input"
      animatedProps={glassAnimatedProps}
      interactive
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
          style={[styles.input, { color: theme.colors.foreground }]}
        />
      </Animated.View>
    </AnimatedGlass>
  );
}
