import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

interface Props {
  /** A voice session is open. */
  active: boolean;
  /** A visual is being generated. The canvas should look like it is gathering itself. */
  forming?: boolean;
}

/**
 * What the screen is when nothing has been generated: a slow, dark, breathing
 * field. It has to read as alive and listening without becoming decoration that
 * competes with a generated world once one arrives.
 *
 * While a visual is rendering it quickens and brightens, so the wait reads as
 * anticipation rather than a frozen screen.
 */
export function IdleCanvas({ active, forming = false }: Props): React.ReactElement {
  const [breath] = useState(() => new Animated.Value(0));
  const [intensity] = useState(() => new Animated.Value(0));
  const [drift] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const period = forming ? 1900 : 5200;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: period,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: period,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath, forming]);

  // Ease between resting and forming rather than snapping.
  useEffect(() => {
    Animated.timing(intensity, {
      toValue: forming ? 1 : 0,
      duration: 700,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [intensity, forming]);

  // A very slow rotation gives the field depth without ever drawing the eye.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(drift, {
        toValue: 1,
        duration: 48_000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);

  const base = active ? 0.34 : 0.2;
  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const breathOpacity = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [base, base + 0.26],
  });
  const boost = intensity.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] });
  const rotate = drift.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={["#07080C", "#0B0D14", "#05060A"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[
          styles.aura,
          {
            opacity: Animated.multiply(breathOpacity, boost),
            transform: [{ scale }, { rotate }],
          },
        ]}
      >
        <LinearGradient
          colors={["rgba(122,150,255,0.5)", "rgba(90,110,220,0.16)", "rgba(0,0,0,0)"]}
          locations={[0, 0.45, 1]}
          style={styles.auraFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  aura: {
    position: "absolute",
    alignSelf: "center",
    top: "26%",
    width: 460,
    height: 460,
  },
  auraFill: { flex: 1, borderRadius: 230 },
});
