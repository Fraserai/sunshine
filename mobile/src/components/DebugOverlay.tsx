import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IS_DEV } from "../lib/config";
import { subscribeTimeline, type TimelineEntry } from "../lib/log";
import type { VisualSnapshot } from "../types";
import type { VoiceSession } from "../voice/useVoiceSession";

interface Props {
  visual: VisualSnapshot;
  voice: VoiceSession;
}

/**
 * Development only. Stripped from production bundles by the IS_DEV guard —
 * nothing here should ever be reachable in a shipped build.
 */
export function DebugOverlay({ visual, voice }: Props): React.ReactElement | null {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<readonly TimelineEntry[]>([]);

  useEffect(() => {
    if (!IS_DEV) return;
    return subscribeTimeline((all) => setEvents([...all]));
  }, []);

  if (!IS_DEV) return null;

  const top = insets.top + 4;

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={14}
        style={[styles.handle, { top }]}
        accessibilityLabel="Open debug overlay"
      >
        <Text style={styles.handleText}>{visual.state[0]?.toUpperCase()}{visual.epoch}</Text>
      </Pressable>
    );
  }

  const recent = events.slice(-14).reverse();

  return (
    <View style={[styles.panel, { top }]}>
      <Pressable onPress={() => setOpen(false)} hitSlop={10} style={styles.close}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>

      <Text style={styles.section}>ELEVENLABS</Text>
      <Row k="phase" v={voice.phase} />
      <Row k="mode" v={voice.isSpeaking ? "speaking" : voice.isListening ? "listening" : "—"} />
      <Row k="conversation" v={voice.conversationId ?? "—"} />

      <Text style={styles.section}>VISUAL</Text>
      <Row k="state" v={visual.state} />
      <Row k="epoch" v={String(visual.epoch)} />
      <Row k="action" v={visual.action ?? "—"} />
      <Row k="in flight" v={String(visual.inFlight)} />
      <Row
        k="segment"
        v={`${visual.segment}/${visual.maxAutoSegments}${visual.isContinuous ? " cont" : ""}`}
      />
      <Row k="players" v={`active ${visual.activePlayer} · preload ${visual.activePlayer === "a" ? "b" : "a"}`} />
      <Row k="fal request" v={visual.lastRequestId ?? "—"} />
      <Row k="latency" v={visual.lastLatencyMs !== null ? `${visual.lastLatencyMs}ms` : "—"} />
      <Row k="current" v={tail(visual.currentVideoUrl)} />
      <Row k="next" v={tail(visual.nextVideoUrl)} />
      {visual.lastError ? <Row k="error" v={visual.lastError} /> : null}

      <Text style={styles.section}>TIMELINE</Text>
      <ScrollView style={styles.timeline} showsVerticalScrollIndicator={false}>
        {recent.map((e, i) => (
          <Text key={`${e.at}-${i}`} style={styles.event} numberOfLines={1}>
            {e.epoch !== undefined ? `e${e.epoch} ` : "   "}
            {e.event}
            {e.sinceToolCallMs !== undefined ? ` +${e.sinceToolCallMs}ms` : ""}
            {e.detail ? ` · ${e.detail}` : ""}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

function tail(url: string | null): string {
  if (!url) return "—";
  const name = url.split("/").pop() ?? url;
  return name.length > 26 ? `…${name.slice(-26)}` : name;
}

function Row({ k, v }: { k: string; v: string }): React.ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.key}>{k}</Text>
      <Text style={styles.value} numberOfLines={1}>
        {v}
      </Text>
    </View>
  );
}

const MONO = "Menlo";

const styles = StyleSheet.create({
  handle: {
    position: "absolute",
    right: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  handleText: { color: "rgba(255,255,255,0.55)", fontSize: 9, fontFamily: MONO },
  panel: {
    position: "absolute",
    right: 8,
    left: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.8)",
    maxHeight: 420,
  },
  close: { position: "absolute", right: 8, top: 4, zIndex: 2 },
  closeText: { color: "rgba(255,255,255,0.6)", fontSize: 18, lineHeight: 20 },
  section: {
    color: "rgba(120,190,255,0.9)",
    fontSize: 8.5,
    letterSpacing: 1.2,
    fontFamily: MONO,
    marginTop: 8,
    marginBottom: 3,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  key: { color: "rgba(255,255,255,0.42)", fontSize: 9.5, fontFamily: MONO },
  value: { color: "rgba(255,255,255,0.88)", fontSize: 9.5, fontFamily: MONO, flexShrink: 1 },
  timeline: { maxHeight: 150 },
  event: { color: "rgba(210,255,210,0.72)", fontSize: 9, fontFamily: MONO, lineHeight: 13 },
});
