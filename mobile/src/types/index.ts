export type VisualAction = "new" | "continue" | "redirect" | "clear";

/** Arguments the agent sends through the direct_visual client tool. */
export interface DirectVisualArgs {
  action: VisualAction;
  prompt: string;
  continuous?: boolean;
  /** Two or three words naming this world, shown on the channel indicator. */
  label?: string;
}

/** A generated world you can return to. Replaying one is free — it is just a CDN URL. */
export interface Channel {
  id: number;
  videoUrl: string;
  /** Short label the agent gave this world, for the channel indicator. */
  label: string;
}

export type VisualState =
  | "idle"
  | "requesting"
  | "preloading"
  | "playing"
  | "transitioning"
  | "error";

export interface VisualGenerateResponse {
  generationId: number;
  videoUrl: string;
  requestId: string;
  inferenceTiming?: Record<string, number>;
  expandedPrompt?: string;
  serverTiming: { totalMs: number; extractFrameMs?: number; generateMs: number };
  degradedToNew?: boolean;
}

export interface VoiceTokenResponse {
  token: string;
  conversationId: string;
  agentId: string;
}

/** Everything the debug overlay renders. Kept flat so snapshots are cheap to diff. */
export interface VisualSnapshot {
  state: VisualState;
  epoch: number;
  /** The URL loaded into each of the two players. The inactive one is the preload buffer. */
  slots: { a: string | null; b: string | null };
  videoVisible: boolean;
  action: VisualAction | null;
  isContinuous: boolean;
  segment: number;
  maxAutoSegments: number;
  currentVideoUrl: string | null;
  nextVideoUrl: string | null;
  currentPrompt: string | null;
  activePlayer: "a" | "b";
  lastRequestId: string | null;
  lastLatencyMs: number | null;
  lastError: string | null;
  inFlight: number;
  /** Every world generated this session. Surfing between them costs nothing. */
  channels: Channel[];
  channelIndex: number;
}
