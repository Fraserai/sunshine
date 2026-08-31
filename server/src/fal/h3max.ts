import { loadEnv } from "../env.js";
import { log } from "../log.js";
import { falClient } from "./client.js";
import { recordExtractFrame, recordVideo } from "./spend.js";

const TEXT_TO_VIDEO = "minimax/h3-max/text-to-video";
const IMAGE_TO_VIDEO = "minimax/h3-max/image-to-video";
const EXTRACT_FRAME = "fal-ai/ffmpeg-api/extract-frame";

export interface VideoResult {
  videoUrl: string;
  requestId: string;
  expandedPrompt?: string;
  timings?: Record<string, number>;
}

interface FalVideoOutput {
  video?: { url?: string };
  expanded_prompt?: string | null;
  timings?: Record<string, number>;
}

interface FalFrameOutput {
  images?: Array<{ url?: string }>;
}

/** fal.subscribe has no built-in deadline; we impose one so a stuck render can't wedge a request. */
async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readVideo(endpoint: string, requestId: string, data: FalVideoOutput): VideoResult {
  const videoUrl = data.video?.url;
  if (!videoUrl) {
    throw new Error(`${endpoint} returned no video URL`);
  }
  return {
    videoUrl,
    requestId,
    ...(data.expanded_prompt ? { expandedPrompt: data.expanded_prompt } : {}),
    ...(data.timings ? { timings: data.timings } : {}),
  };
}

export async function textToVideo(prompt: string): Promise<VideoResult> {
  const env = loadEnv();
  const started = Date.now();
  const result = await withTimeout(
    falClient().subscribe(TEXT_TO_VIDEO, {
      input: {
        prompt,
        duration: env.VISUAL_DURATION_SECONDS,
        resolution: env.VISUAL_RESOLUTION,
        aspect_ratio: "9:16",
        prompt_expansion_mode: env.VISUAL_PROMPT_EXPANSION,
        enable_safety_checker: true,
      },
    }),
    env.VISUAL_TIMEOUT_MS,
    TEXT_TO_VIDEO,
  );
  recordVideo("text_to_video", env.VISUAL_RESOLUTION, env.VISUAL_DURATION_SECONDS);
  log.info("fal.text_to_video.done", { requestId: result.requestId, ms: Date.now() - started });
  return readVideo(TEXT_TO_VIDEO, result.requestId, result.data as FalVideoOutput);
}

/**
 * Aspect ratio is inherited from image_url, so feeding a 9:16 last frame keeps
 * the whole continuation chain vertical without an aspect_ratio field.
 */
export async function imageToVideo(prompt: string, imageUrl: string): Promise<VideoResult> {
  const env = loadEnv();
  const started = Date.now();
  const result = await withTimeout(
    falClient().subscribe(IMAGE_TO_VIDEO, {
      input: {
        prompt,
        image_url: imageUrl,
        duration: env.VISUAL_DURATION_SECONDS,
        resolution: env.VISUAL_RESOLUTION,
        prompt_expansion_mode: env.VISUAL_PROMPT_EXPANSION,
        enable_safety_checker: true,
      },
    }),
    env.VISUAL_TIMEOUT_MS,
    IMAGE_TO_VIDEO,
  );
  recordVideo("image_to_video", env.VISUAL_RESOLUTION, env.VISUAL_DURATION_SECONDS);
  log.info("fal.image_to_video.done", { requestId: result.requestId, ms: Date.now() - started });
  return readVideo(IMAGE_TO_VIDEO, result.requestId, result.data as FalVideoOutput);
}

export async function extractLastFrame(videoUrl: string): Promise<string> {
  const env = loadEnv();
  const started = Date.now();
  const result = await withTimeout(
    falClient().subscribe(EXTRACT_FRAME, {
      input: { video_url: videoUrl, frame_type: "last" },
    }),
    Math.min(env.VISUAL_TIMEOUT_MS, 60_000),
    EXTRACT_FRAME,
  );
  const url = (result.data as FalFrameOutput).images?.[0]?.url;
  if (!url) {
    throw new Error(`${EXTRACT_FRAME} returned no image`);
  }
  recordExtractFrame();
  log.info("fal.extract_frame.done", { requestId: result.requestId, ms: Date.now() - started });
  return url;
}
