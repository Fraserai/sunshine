import * as Haptics from "expo-haptics";
import { useMemo } from "react";
import { PanResponder, StyleSheet, View } from "react-native";

interface Props {
  enabled: boolean;
  onSurf: (direction: 1 | -1) => void;
}

/** Past this, a drag is a deliberate channel change rather than a stray touch. */
const THRESHOLD = 70;

/**
 * The TikTok gesture, doing the one thing this product needs it to do: flick up
 * for the next world, down for the previous. Transparent, and it never steals a
 * tap from the voice control layered above it.
 */
export function ChannelSurfer({ enabled, onSurf }: Props): React.ReactElement | null {
  const responder = useMemo(
    () =>
      PanResponder.create({
        // Only claim the gesture once it is clearly a vertical drag.
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (Math.abs(g.dy) < THRESHOLD) return;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
          onSurf(g.dy < 0 ? 1 : -1);
        },
      }),
    [onSurf],
  );

  if (!enabled) return null;
  return <View style={StyleSheet.absoluteFill} {...responder.panHandlers} />;
}
