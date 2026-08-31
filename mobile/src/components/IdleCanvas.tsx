import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

/**
 * What the screen is when nothing has been generated: a slow, dark, breathing
 * field. It has to read as "alive and listening" without becoming decoration
 * that competes with a generated world once one arrives.
 */
export function IdleCanvas({ active }: { active: boolean }): React.ReactElement {
  const [breath] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const opacity = breath.interpolate({
    inputRange: [0, 1],
    outputRange: active ? [0.34, 0.6] : [0.2, 0.36],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={["#07080C", "#0B0D14", "#05060A"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[styles.aura, { opacity, transform: [{ scale }] }]}>
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
