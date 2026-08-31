import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

// Staggered so the row reads as a voice rather than a metronome.
const DELAYS = [0, 130, 60, 190, 95];
const RESTING = [0.32, 0.5, 0.68, 0.44, 0.28];

/**
 * The entire "who is talking" indicator. Bars swell while the agent speaks and
 * settle into a slow breath while it listens.
 */
export function VoiceBars({ speaking }: { speaking: boolean }): React.ReactElement {
  const [values] = useState(() => RESTING.map((v) => new Animated.Value(v)));

  useEffect(() => {
    const animations = values.map((value, i) => {
      const peak = speaking ? 1 : (RESTING[i] ?? 0.4) + 0.1;
      const floor = speaking ? 0.22 : (RESTING[i] ?? 0.4) - 0.1;
      const duration = speaking ? 300 + i * 40 : 1500 + i * 120;
      return Animated.loop(
        Animated.sequence([
          Animated.delay(DELAYS[i] ?? 0),
          Animated.timing(value, {
            toValue: peak,
            duration,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: floor,
            duration,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
    });
    for (const a of animations) a.start();
    return () => {
      for (const a of animations) a.stop();
    };
  }, [speaking, values]);

  return (
    <View style={styles.row}>
      {values.map((value, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              opacity: speaking ? 0.95 : 0.55,
              transform: [{ scaleY: value }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 22,
    gap: 4,
  },
  bar: {
    width: 3,
    height: 22,
    borderRadius: 1.5,
    backgroundColor: "#FFFFFF",
  },
});

