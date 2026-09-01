import { BlurView } from "expo-blur";
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  label: string | null;
  index: number;
  total: number;
}

/**
 * Names the world you are on, then gets out of the way. It surfaces on every
 * change and fades after a couple of seconds so the canvas is never competing
 * with a permanent overlay.
 */
export function ChannelIndicator({ label, index, total }: Props): React.ReactElement | null {
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!label) return;
    opacity.setValue(0);
    const anim = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(2200),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 700,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [label, index, opacity]);

  if (!label) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.root, { top: insets.top + 10, opacity }]}
    >
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      <Text style={styles.text} numberOfLines={1}>
        {total > 1 ? `${index + 1}/${total}  ` : ""}
        {label.toUpperCase()}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    alignSelf: "center",
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  text: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: "600",
  },
});
