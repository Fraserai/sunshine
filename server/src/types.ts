/** Shared wire types between the mobile client and this server. */

export type VisualAction = "new" | "continue" | "redirect" | "clear";

export interface VisualGenerateRequest {
  /** "clear" never reaches the server; it is resolved entirely on-device. */
  action: Exclude<VisualAction, "clear">;
  prompt: string;
  /** Required for continue/redirect: the clip we extract a last frame from. */
  previousVideoUrl?: string;
  /** Monotonic epoch minted by the client's VisualEngine. Echoed back verbatim. */
  generationId: number;
}

export interface VisualGenerateResponse {
  generationId: number;
  videoUrl: string;
  requestId: string;
  /** Model-side timings reported by fal, in seconds. */
  inferenceTiming?: Record<string, number>;
  expandedPrompt?: string;
  /** Wall-clock server timings, in ms, for latency accounting. */
  serverTiming: {
    totalMs: number;
    extractFrameMs?: number;
    generateMs: number;
  };
  /** Set when continue/redirect had to fall back to text-to-video. */
  degradedToNew?: boolean;
}

export interface VoiceTokenResponse {
  token: string;
  conversationId: string;
  agentId: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
