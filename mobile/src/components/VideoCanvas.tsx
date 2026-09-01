import { useEventListener } from "expo";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import { CROSSFADE_MS, REVEAL_MS } from "../lib/config";
import { visualEngine } from "../visual/VisualEngine";
import { useVisualSnapshot } from "../visual/useVisualEngine";

/** Seek-to-start plus play, kept out of the component so the compiler sees one opaque call. */
function restart(player: VideoPlayer): void {
  try {
    player.currentTime = 0;
    player.play();
  } catch {
    // A player released mid-transition is not worth crashing the canvas over.
  }
}

function halt(player: VideoPlayer): void {
  try {
    player.pause();
  } catch {
    /* released */
  }
}

/** A single clip with nothing queued behind it should breathe, not freeze. */
function setLooping(player: VideoPlayer, loop: boolean): void {
  try {
    player.loop = loop;
  } catch {
    /* released */
  }
}

function configure(player: VideoPlayer): void {
  // The ElevenLabs voice owns the soundstage. H3 Max renders audio; we never play it.
  player.muted = true;
  player.volume = 0;
  player.loop = false;
  player.timeUpdateEventInterval = 0;
  player.audioMixingMode = "mixWithOthers";
}

/**
 * Two players, one visible. Whichever is off screen is the preload buffer, so the
 * next clip is fully buffered before it is ever shown and the swap is a crossfade
 * rather than a load. When nothing is buffered in time, the outgoing clip simply
 * holds its final frame instead of flashing black.
 */
export function VideoCanvas(): React.ReactElement {
  const snapshot = useVisualSnapshot();
  const playerA = useVideoPlayer(null, configure);
  const playerB = useVideoPlayer(null, configure);

  const [opacityA] = useState(() => new Animated.Value(1));
  const [opacityB] = useState(() => new Animated.Value(0));
  const [layerOpacity] = useState(() => new Animated.Value(0));
  // A touch of scale so the world settles into place rather than popping in.
  const [layerScale] = useState(() => new Animated.Value(1.06));

  const urlA = snapshot.slots.a;
  const urlB = snapshot.slots.b;
  const activeSlot = snapshot.activePlayer;

  useSlotSource(playerA, urlA);
  useSlotSource(playerB, urlB);

  useSlotReporters(playerA, urlA);
  useSlotReporters(playerB, urlB);

  // Crossfade whenever the engine hands the screen to the other player.
  useEffect(() => {
    const incoming = activeSlot === "a" ? playerA : playerB;
    const outgoing = activeSlot === "a" ? playerB : playerA;
    const incomingOpacity = activeSlot === "a" ? opacityA : opacityB;
    const outgoingOpacity = activeSlot === "a" ? opacityB : opacityA;

    if (!(activeSlot === "a" ? urlA : urlB)) return;

    restart(incoming);

    const animation = Animated.parallel([
      Animated.timing(incomingOpacity, {
        toValue: 1,
        duration: CROSSFADE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(outgoingOpacity, {
        toValue: 0,
        duration: CROSSFADE_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (!finished) return;
      // Stop the clip that is no longer visible so it is not decoding for nothing.
      halt(outgoing);
      visualEngine.notifyTransitionComplete();
    });

    return () => animation.stop();
  }, [activeSlot, urlA, urlB, playerA, playerB, opacityA, opacityB]);

  /**
   * Loop the visible clip whenever nothing is queued behind it, so a finished
   * scene keeps moving instead of holding a dead frame. The moment a successor
   * is rendering or buffered we stop looping, so `playToEnd` can fire and drive
   * a seamless swap.
   */
  const hasSuccessor = Boolean(snapshot.nextVideoUrl) || snapshot.inFlight > 0;
  useEffect(() => {
    setLooping(activeSlot === "a" ? playerA : playerB, !hasSuccessor);
  }, [activeSlot, hasSuccessor, playerA, playerB]);

  // Reveal the world on the first clip, and dissolve back to the canvas on clear.
  useEffect(() => {
    const showing = snapshot.videoVisible;
    Animated.parallel([
      Animated.timing(layerOpacity, {
        toValue: showing ? 1 : 0,
        duration: REVEAL_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(layerScale, {
        toValue: showing ? 1 : 1.06,
        duration: REVEAL_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [snapshot.videoVisible, layerOpacity, layerScale]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: layerOpacity, transform: [{ scale: layerScale }] }]}
      pointerEvents="none"
    >
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacityA }]}>
        <VideoView
          style={StyleSheet.absoluteFill}
          player={playerA}
          contentFit="cover"
          nativeControls={false}
          allowsPictureInPicture={false}
          onFirstFrameRender={() => {
            if (urlA) visualEngine.notifyVisible(urlA);
          }}
        />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacityB }]}>
        <VideoView
          style={StyleSheet.absoluteFill}
          player={playerB}
          contentFit="cover"
          nativeControls={false}
          allowsPictureInPicture={false}
          onFirstFrameRender={() => {
            if (urlB) visualEngine.notifyVisible(urlB);
          }}
        />
      </Animated.View>
    </Animated.View>
  );
}

/** Pushes the engine's URL for a slot into that slot's player, exactly once per change. */
function useSlotSource(player: VideoPlayer, url: string | null): void {
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (loadedRef.current === url) return;
    loadedRef.current = url;

    if (!url) {
      try {
        player.replace(null);
      } catch {
        /* released */
      }
      return;
    }

    // Buffers without playing; the crossfade effect starts playback.
    player.replaceAsync(url).catch(() => {
      // A load failure leaves the current scene alone. The engine reports it; voice continues.
    });
  }, [player, url]);
}

/** Reports buffering and end-of-clip back to the engine, tagged with the slot's URL. */
function useSlotReporters(player: VideoPlayer, url: string | null): void {
  useEventListener(player, "statusChange", ({ status }) => {
    if (status !== "readyToPlay" || !url) return;
    visualEngine.notifyPreloadReady(url);
  });

  useEventListener(player, "playToEnd", () => {
    if (url) visualEngine.notifyClipEnded(url);
  });
}
