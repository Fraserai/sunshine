import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { VoicePhase } from "../voice/useVoiceSession";
import { VoiceBars } from "./VoiceBars";

interface Props {
  phase: VoicePhase;
  isSpeaking: boolean;
  problem: string | null;
  onStart: () => void;
  onStop: () => void;
}

/**
 * The only chrome in the product. Idle shows one control; connected shrinks to a
 * state indicator and a way out. Everything sits in the bottom thumb area so the
 * generated canvas keeps the rest of the display.
 */
export function VoiceControl({ phase, isSpeaking, problem, onStart, onStop }: Props): React.ReactElement {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 18) + 14;

  const connected = phase === "connected" || phase === "reconnecting";

  return (
    <View style={[styles.root, { paddingBottom: bottom }]} pointerEvents="box-none">
      {connected ? (
        <ConnectedControl phase={phase} isSpeaking={isSpeaking} onStop={onStop} />
      ) : (
        <StartControl phase={phase} problem={problem} onStart={onStart} />
      )}
    </View>
  );
}

function StartControl({
  phase,
  problem,
  onStart,
}: {
  phase: VoicePhase;
  problem: string | null;
  onStart: () => void;
}): React.ReactElement {
  const [pulse] = useState(() => new Animated.Value(0));
  const connecting = phase === "connecting";

  useEffect(() => {
    if (connecting) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, connecting]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.28, 0] });

  return (
    <View style={styles.startWrap}>
      <View style={styles.orbWrap}>
        {!connecting && (
          <Animated.View
            pointerEvents="none"
            style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
          />
        )}
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onStart();
          }}
          disabled={connecting}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Start talking"
          style={({ pressed }) => [styles.orb, pressed && styles.orbPressed]}
        >
          <BlurView intensity={26} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.orbTint} />
          {connecting ? <ActivityIndicator color="#FFFFFF" /> : <View style={styles.orbDot} />}
        </Pressable>
      </View>
      <Text style={styles.caption}>
        {problem ?? (connecting ? "Connecting" : "Tap to talk")}
      </Text>
    </View>
  );
}

function ConnectedControl({
  phase,
  isSpeaking,
  onStop,
}: {
  phase: VoicePhase;
  isSpeaking: boolean;
  onStop: () => void;
}): React.ReactElement {
  const reconnecting = phase === "reconnecting";
  return (
    <View style={styles.connectedRow}>
      <View style={styles.capsule}>
        <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.capsuleTint} />
        {reconnecting ? (
          <Text style={styles.capsuleText}>Reconnecting</Text>
        ) : (
          <VoiceBars speaking={isSpeaking} />
        )}
      </View>
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onStop();
        }}
        hitSlop={18}
        accessibilityRole="button"
        accessibilityLabel="End conversation"
        style={({ pressed }) => [styles.endButton, pressed && styles.endButtonPressed]}
      >
        <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.capsuleTint} />
        <View style={styles.endGlyph} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },

  startWrap: { alignItems: "center", gap: 16 },
  orbWrap: { alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  orb: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
  },
  orbPressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  orbTint: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.1)" },
  orbDot: { width: 13, height: 13, borderRadius: 6.5, backgroundColor: "#FFFFFF" },

  caption: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontWeight: "500",
  },

  connectedRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  capsule: {
    minWidth: 96,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
  capsuleTint: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.2)" },
  capsuleText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: "500",
  },
  endButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
  endButtonPressed: { opacity: 0.7 },
  endGlyph: { width: 13, height: 13, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.85)" },
});
