import { generateVisual } from "../lib/api";
import { CROSSFADE_MS, VISUAL_MAX_AUTO_SEGMENTS } from "../lib/config";
import { markEpochStart, timeline } from "../lib/log";
import type { Channel, DirectVisualArgs, VisualAction, VisualSnapshot, VisualState } from "../types";

type Slot = "a" | "b";

/**
 * Whether a finished generation should take the screen the moment it is ready,
 * or wait for the clip currently on screen to run out.
 *
 * Anything the user asked for is `immediate` — they said it out loud, so they
 * should see it as soon as it exists. Unattended continuation segments are
 * `at-clip-end`, which is what makes a continuous visual look seamless.
 */
type SwapPolicy = "immediate" | "at-clip-end";

interface InFlight {
  epoch: number;
  controller: AbortController;
}

const CONTINUATION_PROMPT =
  "Carry the same visualization forward as one unbroken take, advancing whatever is unfolding by one more " +
  "step. Keep the same representation and visual language; do not restart or restate it.";

/**
 * Owns every decision about what the screen is showing and what is being generated.
 *
 * The invariant that matters: a generation result is only applied if its epoch is
 * still the current epoch. Epochs increase monotonically and every new direction
 * (or clear) mints a new one, so a slow render that lands after the user has moved
 * on can never overwrite the newer visual.
 *
 * Exactly one generation is ever in flight. That is what keeps staleness trivial
 * and stops continuous mode from billing in parallel.
 */
export class VisualEngine {
  private epoch = 0;
  private state: VisualState = "idle";
  private slots: { a: string | null; b: string | null } = { a: null, b: null };
  private activeSlot: Slot = "a";
  private videoVisible = false;

  private currentPrompt: string | null = null;
  private currentAction: VisualAction | null = null;
  private isContinuous = false;
  private segment = 0;

  private inFlight: InFlight | null = null;
  private pendingPolicy: SwapPolicy = "immediate";
  private pendingLabel = "";
  private pendingReady = false;
  private awaitingNextAtClipEnd = false;
  private lastVisibleUrl: string | null = null;

  /** Every world generated this session, in order. Replaying one costs nothing. */
  private channels: Channel[] = [];
  private channelIndex = -1;
  private nextChannelId = 1;

  private lastRequestId: string | null = null;
  private lastLatencyMs: number | null = null;
  private lastError: string | null = null;

  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();
  private snapshot: VisualSnapshot;

  constructor() {
    this.snapshot = this.computeSnapshot();
  }

  // ---------------------------------------------------------------- subscription

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): VisualSnapshot => this.snapshot;

  // ---------------------------------------------------------------- commands

  /**
   * Entry point for the direct_visual client tool. Returns synchronously — the
   * network work is deliberately left running in the background so the agent's
   * speech is never gated on a render.
   */
  direct(args: DirectVisualArgs): void {
    if (args.action === "clear") {
      this.clear();
      return;
    }

    const prompt = args.prompt?.trim();
    if (!prompt) {
      // A malformed call must not disturb whatever is already on screen.
      timeline("tool.direct_visual", this.epoch, `ignored ${args.action} with empty prompt`);
      return;
    }

    // With nothing on screen there is no frame to continue from, so those degrade to new.
    const hasWorld = this.videoVisible && Boolean(this.slots[this.activeSlot]);
    const action: Exclude<VisualAction, "clear"> =
      args.action !== "new" && !hasWorld ? "new" : args.action;

    this.currentAction = action;
    this.currentPrompt = prompt;
    this.pendingLabel = (args.label ?? "").trim() || deriveLabel(prompt);
    this.isContinuous = args.continuous ?? false;
    this.segment = 1;
    this.awaitingNextAtClipEnd = false;

    this.startGeneration(action, prompt, "immediate");
  }

  /**
   * Move through worlds already generated this session. Costs nothing: the clip
   * is a CDN URL we simply load into the off-screen player and crossfade to.
   * Wraps around, so the dial never dead-ends.
   */
  surf(direction: 1 | -1): void {
    if (this.channels.length < 2) return;

    const count = this.channels.length;
    const next = (this.channelIndex + direction + count) % count;
    const channel = this.channels[next];
    if (!channel) return;

    this.channelIndex = next;
    this.currentPrompt = channel.label;
    this.pendingLabel = channel.label;
    this.pendingPolicy = "immediate";
    this.pendingReady = false;
    this.awaitingNextAtClipEnd = false;

    // Straight into the off-screen player; the canvas crossfades when it buffers.
    this.slots = { ...this.slots, [this.inactiveSlot()]: channel.videoUrl };
    timeline("visual.surf", this.epoch, `channel ${next + 1}/${count} · ${channel.label}`);
    this.emit();
  }

  /** The world currently on the dial, if any. */
  currentChannel(): Channel | null {
    return this.channels[this.channelIndex] ?? null;
  }

  clear(): void {
    this.bumpEpoch();
    this.cancelInFlight();

    this.currentAction = "clear";
    this.currentPrompt = null;
    this.isContinuous = false;
    this.segment = 0;
    this.pendingReady = false;
    this.awaitingNextAtClipEnd = false;
    this.videoVisible = false;
    this.lastVisibleUrl = null;
    this.lastError = null;
    this.setState("idle");

    timeline("visual.clear", this.epoch);

    // Let the canvas fade out before the sources are released.
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => {
      this.clearTimer = null;
      this.slots = { a: null, b: null };
      this.emit();
    }, CROSSFADE_MS + 80);

    this.emit();
  }

  /** Called when the voice session ends. Drops everything without a lingering timer. */
  reset(): void {
    this.bumpEpoch();
    this.cancelInFlight();
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
    this.slots = { a: null, b: null };
    this.activeSlot = "a";
    this.videoVisible = false;
    this.channels = [];
    this.channelIndex = -1;
    this.currentAction = null;
    this.currentPrompt = null;
    this.isContinuous = false;
    this.segment = 0;
    this.pendingReady = false;
    this.awaitingNextAtClipEnd = false;
    this.lastVisibleUrl = null;
    this.lastError = null;
    this.lastRequestId = null;
    this.lastLatencyMs = null;
    this.setState("idle");
    this.emit();
  }

  // ---------------------------------------------------------------- view callbacks

  /** The inactive player finished buffering the clip we preloaded into it. */
  notifyPreloadReady(url: string): void {
    if (this.pendingReady) return;
    if (url !== this.slots[this.inactiveSlot()]) return;

    this.pendingReady = true;
    timeline("preload.complete", this.epoch);

    if (this.pendingPolicy === "immediate" || this.awaitingNextAtClipEnd || !this.videoVisible) {
      this.commitSwap();
    } else {
      this.setState("preloading");
    }
    this.emit();
  }

  /** The visible clip reached its end. */
  notifyClipEnded(url: string): void {
    if (url !== this.slots[this.activeSlot]) return;

    if (this.pendingReady) {
      this.commitSwap();
    } else {
      // Nothing to cut to: hold the final frame rather than flash black.
      this.awaitingNextAtClipEnd = true;
      this.setState(this.inFlight ? "requesting" : "playing");
    }
    this.emit();
  }

  /** The active player rendered its first frame — the moment the user actually sees it. */
  notifyVisible(url: string): void {
    if (url !== this.slots[this.activeSlot]) return;
    if (url === this.lastVisibleUrl) return;
    this.lastVisibleUrl = url;

    timeline("video.visible", this.epoch);
    this.setState("playing");
    this.emit();
    this.maybeContinue();
  }

  /** Crossfade animation finished. */
  notifyTransitionComplete(): void {
    if (this.state !== "transitioning") return;
    this.setState("playing");
    this.emit();
  }

  // ---------------------------------------------------------------- internals

  private bumpEpoch(): number {
    this.epoch += 1;
    return this.epoch;
  }

  private cancelInFlight(): void {
    if (!this.inFlight) return;
    // Best-effort network cancellation; correctness comes from the epoch check.
    this.inFlight.controller.abort();
    this.inFlight = null;
  }

  private inactiveSlot(): Slot {
    return this.activeSlot === "a" ? "b" : "a";
  }

  private startGeneration(
    action: Exclude<VisualAction, "clear">,
    prompt: string,
    policy: SwapPolicy,
  ): void {
    this.cancelInFlight();
    const epoch = this.bumpEpoch();
    markEpochStart(epoch);
    timeline("tool.direct_visual", epoch, `${action}${this.isContinuous ? " · continuous" : ""}`);

    this.pendingReady = false;
    this.pendingPolicy = policy;
    this.lastError = null;
    if (!this.videoVisible) this.setState("requesting");

    const controller = new AbortController();
    this.inFlight = { epoch, controller };

    const previousVideoUrl = this.slots[this.activeSlot];
    const startedAt = Date.now();
    timeline("fal.request.start", epoch, action);

    void generateVisual(
      {
        action,
        prompt,
        generationId: epoch,
        ...(action !== "new" && previousVideoUrl ? { previousVideoUrl } : {}),
      },
      controller.signal,
    )
      .then((result) => {
        if (epoch !== this.epoch) {
          // The user moved on while this was rendering. Drop it on the floor.
          timeline("fal.request.stale", epoch, `superseded by e${this.epoch}`);
          return;
        }
        this.inFlight = null;
        this.lastRequestId = result.requestId;
        this.lastLatencyMs = Date.now() - startedAt;
        timeline(
          "fal.request.result",
          epoch,
          `${this.lastLatencyMs}ms${result.degradedToNew ? " · continuity lost, fell back to new" : ""}`,
        );

        // Every generated world joins the dial, so it can be surfed back to for free.
        this.channels = [
          ...this.channels,
          { id: this.nextChannelId++, videoUrl: result.videoUrl, label: this.pendingLabel },
        ];
        this.channelIndex = this.channels.length - 1;

        // Load into whichever player is not currently on screen.
        this.slots = { ...this.slots, [this.inactiveSlot()]: result.videoUrl };
        this.setState("preloading");
        this.emit();
      })
      .catch((err: unknown) => {
        if (epoch !== this.epoch) {
          timeline("fal.request.stale", epoch, "errored after being superseded");
          return;
        }
        this.inFlight = null;
        const message = err instanceof Error ? err.message : String(err);
        this.lastError = message;
        timeline("fal.request.error", epoch, message);
        // Whatever is on screen stays exactly where it is. Voice is untouched.
        this.setState(this.videoVisible ? "playing" : "error");
        this.emit();
      });

    this.emit();
  }

  private commitSwap(): void {
    const target = this.inactiveSlot();
    if (!this.slots[target]) return;

    this.activeSlot = target;
    this.videoVisible = true;
    this.pendingReady = false;
    this.awaitingNextAtClipEnd = false;
    this.setState("transitioning");
  }

  /**
   * Continuous mode: the moment a segment is actually on screen, start rendering
   * the next one, so generation runs underneath playback instead of after it.
   */
  private maybeContinue(): void {
    if (!this.isContinuous) return;
    if (this.inFlight) return;
    if (this.segment >= VISUAL_MAX_AUTO_SEGMENTS) return;
    if (!this.currentPrompt) return;

    this.segment += 1;
    this.startGeneration("continue", CONTINUATION_PROMPT, "at-clip-end");
  }

  private setState(next: VisualState): void {
    this.state = next;
  }

  private computeSnapshot(): VisualSnapshot {
    return {
      state: this.state,
      epoch: this.epoch,
      slots: this.slots,
      videoVisible: this.videoVisible,
      action: this.currentAction,
      isContinuous: this.isContinuous,
      segment: this.segment,
      maxAutoSegments: VISUAL_MAX_AUTO_SEGMENTS,
      currentVideoUrl: this.videoVisible ? this.slots[this.activeSlot] : null,
      nextVideoUrl: this.slots[this.inactiveSlot()],
      currentPrompt: this.currentPrompt,
      activePlayer: this.activeSlot,
      lastRequestId: this.lastRequestId,
      lastLatencyMs: this.lastLatencyMs,
      lastError: this.lastError,
      inFlight: this.inFlight ? 1 : 0,
      channels: this.channels,
      channelIndex: this.channelIndex,
    };
  }

  private emit(): void {
    this.snapshot = this.computeSnapshot();
    for (const listener of this.listeners) listener();
  }
}

export const visualEngine = new VisualEngine();

/** Fallback channel name when the agent does not supply one. */
function deriveLabel(prompt: string): string {
  const words = prompt.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).slice(0, 3);
  return words.join(" ") || "Untitled";
}
