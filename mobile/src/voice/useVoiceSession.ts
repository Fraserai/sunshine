import { useConversation } from "@elevenlabs/react-native";
import { useCallback, useRef, useState } from "react";
import { fetchVoiceToken } from "../lib/api";
import { timeline } from "../lib/log";
import type { DirectVisualArgs } from "../types";
import { visualEngine } from "../visual/VisualEngine";

export type VoicePhase = "idle" | "connecting" | "connected" | "reconnecting" | "failed";

export interface VoiceSession {
  phase: VoicePhase;
  isSpeaking: boolean;
  isListening: boolean;
  conversationId: string | null;
  /** Consumer-safe copy, never a raw API error. */
  problem: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

function isDirectVisualArgs(value: unknown): value is DirectVisualArgs {
  if (typeof value !== "object" || value === null) return false;
  const action = (value as { action?: unknown }).action;
  return action === "new" || action === "continue" || action === "redirect" || action === "clear";
}

/**
 * Wraps the ElevenLabs agent session and registers the one client tool the
 * product has. Voice never waits on the visual layer: direct_visual queues work
 * in VisualEngine and returns immediately.
 */
export function useVoiceSession(): VoiceSession {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // Distinguishes a user-requested hang-up from a dropped connection.
  const intentionalStop = useRef(false);

  const conversation = useConversation({
    clientTools: {
      direct_visual: (parameters: unknown) => {
        if (!isDirectVisualArgs(parameters)) {
          timeline("tool.direct_visual", undefined, "malformed arguments, ignored");
          return;
        }
        // Fire and forget. The agent is configured with expects_response=false,
        // so nothing here can stall the conversation.
        visualEngine.direct(parameters);
      },
    },
    onConnect: ({ conversationId: id }) => {
      intentionalStop.current = false;
      setConversationId(id);
      setPhase("connected");
      setProblem(null);
      timeline("session.connected", undefined, id);
    },
    onDisconnect: () => {
      timeline("session.disconnected");
      visualEngine.reset();
      if (intentionalStop.current) {
        setPhase("idle");
        setConversationId(null);
      } else {
        // Dropped rather than ended: show a minimal reconnect affordance.
        setPhase("reconnecting");
      }
    },
    onModeChange: ({ mode }) => {
      timeline(mode === "speaking" ? "agent.response" : "user.turn");
    },
    onError: (message) => {
      // Raw API text stays in the log; the interface only ever says something calm.
      console.warn("[sunshine] conversation error:", message);
      setProblem("Lost the connection.");
      setPhase((current) => (current === "connected" ? "reconnecting" : "failed"));
    },
  });

  const start = useCallback(async () => {
    setProblem(null);
    setPhase("connecting");
    timeline("session.start");
    try {
      const { token } = await fetchVoiceToken();
      // Private agent: a server-minted WebRTC token, never an API key on device.
      conversation.startSession({ conversationToken: token, connectionType: "webrtc" });
    } catch (err) {
      console.warn("[sunshine] could not start session:", err);
      setProblem("Couldn't connect. Tap to try again.");
      setPhase("failed");
    }
  }, [conversation]);

  const stop = useCallback(() => {
    intentionalStop.current = true;
    conversation.endSession();
    visualEngine.reset();
    setPhase("idle");
    setConversationId(null);
  }, [conversation]);

  return {
    phase,
    isSpeaking: conversation.isSpeaking,
    isListening: phase === "connected" && !conversation.isSpeaking,
    conversationId,
    problem,
    start,
    stop,
  };
}
