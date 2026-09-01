import { useKeepAwake } from "expo-keep-awake";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { ChannelIndicator } from "../components/ChannelIndicator";
import { ChannelSurfer } from "../components/ChannelSurfer";
import { DebugOverlay } from "../components/DebugOverlay";
import { IdleCanvas } from "../components/IdleCanvas";
import { VideoCanvas } from "../components/VideoCanvas";
import { VoiceControl } from "../components/VoiceControl";
import { visualEngine } from "../visual/VisualEngine";
import { useVisualSnapshot } from "../visual/useVisualEngine";
import { useVoiceSession } from "../voice/useVoiceSession";

/**
 * The whole product. One screen: a generated canvas edge to edge, and the
 * smallest possible voice control floating over the bottom of it.
 */
export function CanvasScreen(): React.ReactElement {
  // A conversation is a hands-free activity; the screen must not sleep mid-answer.
  useKeepAwake();

  const voice = useVoiceSession();
  const visual = useVisualSnapshot();

  const active = voice.phase === "connected" || voice.phase === "connecting";

  return (
    <View style={styles.root}>
      {/* Always mounted underneath, so a clear or a failed render reveals it rather than black. */}
      <IdleCanvas
        active={active}
        forming={visual.inFlight > 0 || visual.state === "requesting"}
      />
      <VideoCanvas />

      {/* Flick up or down to change world. Free — these are already generated. */}
      <ChannelSurfer
        enabled={visual.channels.length > 1}
        onSurf={(direction) => visualEngine.surf(direction)}
      />

      <ChannelIndicator
        label={visual.channels[visual.channelIndex]?.label ?? null}
        index={visual.channelIndex}
        total={visual.channels.length}
      />

      <StatusBar style="light" />

      <VoiceControl
        phase={voice.phase}
        isSpeaking={voice.isSpeaking}
        problem={voice.problem}
        onStart={() => void voice.start()}
        onReconnect={() => void voice.reconnect()}
        onStop={voice.stop}
      />

      <DebugOverlay visual={visual} voice={voice} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
});
