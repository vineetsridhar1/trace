import { useState } from "react";
import { Image, StyleSheet, View, type ImageStyle, type ViewStyle } from "react-native";
import { useTheme } from "@/theme";
import { Text } from "./Text";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

export interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: AvatarSize;
  style?: ViewStyle & ImageStyle;
}

const DIAMETER: Record<AvatarSize, number> = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 48,
};

const INITIAL_FONT_SIZE: Record<AvatarSize, number> = {
  xs: 9,
  sm: 12,
  md: 14,
  lg: 18,
};

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}

function hueFromName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

export function Avatar({ name, uri, size = "md", style }: AvatarProps) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const diameter = DIAMETER[size];

  const sharedSize = {
    width: diameter,
    height: diameter,
    borderRadius: diameter / 2,
  };

  const showImage = uri && !failed;

  if (showImage) {
    const imageStyle: ImageStyle = { ...sharedSize, overflow: "hidden" };
    return (
      <Image
        source={{ uri }}
        onError={() => setFailed(true)}
        style={[imageStyle, style]}
        accessible
        accessibilityLabel={name}
      />
    );
  }

  const viewStyle: ViewStyle = { ...sharedSize, overflow: "hidden" };

  const hue = hueFromName(name);
  const bg = `hsl(${hue}, 45%, 32%)`;

  return (
    <View
      style={[styles.fallback, viewStyle, { backgroundColor: bg }, style]}
      accessible
      accessibilityLabel={name}
    >
      <Text
        style={{
          fontSize: INITIAL_FONT_SIZE[size],
          fontWeight: "600",
          color: theme.colors.accentForeground,
        }}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
});
