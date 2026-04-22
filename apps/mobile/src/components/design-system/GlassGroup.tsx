import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { GlassContainer, isLiquidGlassAvailable } from "expo-glass-effect";

export interface GlassGroupProps {
  children?: ReactNode;
  /** Distance in pt at which child glass elements begin to merge. */
  spacing?: number;
  style?: StyleProp<ViewStyle>;
}

export function GlassGroup({ children, spacing, style }: GlassGroupProps) {
  if (isLiquidGlassAvailable()) {
    return (
      <GlassContainer spacing={spacing} style={style}>
        {children}
      </GlassContainer>
    );
  }
  return <View style={style}>{children}</View>;
}
