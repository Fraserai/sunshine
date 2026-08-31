import { Router } from "express";
import { z } from "zod";
import { loadEnv } from "../env.js";
import { dryRunVideo } from "../fal/dryRun.js";
import { extractLastFrame, imageToVideo, textToVideo, type VideoResult } from "../fal/h3max.js";
import { composeContinuePrompt, composeNewPrompt, composeRedirectPrompt } from "../fal/prompts.js";
import { log } from "../log.js";
import type { VisualGenerateResponse } from "../types.js";

export const visualRouter: Router = Router();

const bodySchema = z
  .object({
    action: z.enum(["new", "continue", "redirect"]),
    prompt: z.string().trim().min(1).max(4000),
    previousVideoUrl: z.url().optional(),
    generationId: z.number().int().nonnegative(),
  })
  .refine((b) => b.action === "new" || Boolean(b.previousVideoUrl), {
    message: "previousVideoUrl is required for continue and redirect",
    path: ["previousVideoUrl"],
  });

/** Transient enough to be worth exactly one more attempt. */
function isTransient(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500;
  const msg = String(err).toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("fetch failed") ||
    msg.includes("network")
  );
}

/**
 * Every retry is a second BILLED generation, so this is opt-in through
 * VISUAL_MAX_RETRIES and defaults to none.
 */
async function withRetries<T>(label: string, work: () => Promise<T>): Promise<T> {
  const budget = loadEnv().VISUAL_MAX_RETRIES;
  let attempt = 0;
  for (;;) {
    try {
      return await work();
    } catch (err) {
      if (attempt >= budget || !isTransient(err)) throw err;
      attempt += 1;
      log.warn("fal.retry", { label, attempt, budget, error: String(err) });
    }
  }
}

/** How the phone can reach this server, for dry-run placeholder URLs. */
function publicBaseUrl(req: { protocol: string; get(name: string): string | undefined }): string {
  const configured = loadEnv().PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

visualRouter.post("/generate", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: "invalid_request", message: z.prettifyError(parsed.error) },
    });
    return;
  }

  const { action, prompt, previousVideoUrl, generationId } = parsed.data;
  const startedAt = Date.now();
  const dryRun = loadEnv().VISUAL_DRY_RUN;
  log.info("visual.request", { generationId, action, promptChars: prompt.length, dryRun });

  if (dryRun) {
    // No fal call, nothing billed.
    const video = await dryRunVideo(publicBaseUrl(req), generationId);
    const payload: VisualGenerateResponse = {
      generationId,
      videoUrl: video.videoUrl,
      requestId: video.requestId,
      ...(video.timings ? { inferenceTiming: video.timings } : {}),
      serverTiming: { totalMs: Date.now() - startedAt, generateMs: Date.now() - startedAt },
    };
    log.info("visual.response", { generationId, action, dryRun: true, totalMs: payload.serverTiming.totalMs });
    res.json(payload);
    return;
  }

  try {
    let video: VideoResult;
    let extractFrameMs: number | undefined;
    let degradedToNew = false;
    let generateStartedAt = Date.now();

    if (action === "new") {
      video = await withRetries("text_to_video", () => textToVideo(composeNewPrompt(prompt)));
    } else {
      // Continuity path: last frame of the previous clip seeds the next one.
      let frameUrl: string | null = null;
      const frameStartedAt = Date.now();
      try {
        frameUrl = await withRetries("extract_frame", () => extractLastFrame(previousVideoUrl!));
      } catch (err) {
        // Losing continuity is far better than losing the visual entirely.
        log.warn("visual.extract_frame_failed_falling_back_to_new", { generationId, error: String(err) });
      }
      extractFrameMs = Date.now() - frameStartedAt;

      generateStartedAt = Date.now();
      if (frameUrl) {
        const continuationPrompt =
          action === "continue" ? composeContinuePrompt(prompt) : composeRedirectPrompt(prompt);
        video = await withRetries("image_to_video", () => imageToVideo(continuationPrompt, frameUrl!));
      } else {
        degradedToNew = true;
        video = await withRetries("text_to_video_fallback", () => textToVideo(composeNewPrompt(prompt)));
      }
    }

    const payload: VisualGenerateResponse = {
      generationId,
      videoUrl: video.videoUrl,
      requestId: video.requestId,
      ...(video.timings ? { inferenceTiming: video.timings } : {}),
      ...(video.expandedPrompt ? { expandedPrompt: video.expandedPrompt } : {}),
      serverTiming: {
        totalMs: Date.now() - startedAt,
        ...(extractFrameMs !== undefined ? { extractFrameMs } : {}),
        generateMs: Date.now() - generateStartedAt,
      },
      ...(degradedToNew ? { degradedToNew: true } : {}),
    };

    log.info("visual.response", {
      generationId,
      action,
      requestId: payload.requestId,
      totalMs: payload.serverTiming.totalMs,
      degradedToNew,
    });
    res.json(payload);
  } catch (err) {
    log.error("visual.failed", { generationId, action, error: String(err) });
    res.status(502).json({
      error: { code: "visual_generation_failed", message: "The visual could not be generated." },
    });
  }
});
