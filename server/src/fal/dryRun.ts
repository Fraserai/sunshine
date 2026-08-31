import type { VideoResult } from "./h3max.js";

const CLIPS = ["clip-1", "clip-2", "clip-3", "clip-4", "clip-5"] as const;

/** Roughly what a real 5s 768P H3 Max render costs in wall time, so preload timing is exercised. */
const SIMULATED_MS = 3500;
const JITTER_MS = 1800;

/**
 * Stands in for a paid fal generation. Returns a locally served placeholder clip
 * so the full on-device experience can be exercised without spending anything.
 *
 * Clips rotate by generation id, so consecutive scenes look different and it is
 * obvious which epoch actually reached the screen.
 */
export async function dryRunVideo(baseUrl: string, generationId: number): Promise<VideoResult> {
  const delay = SIMULATED_MS + Math.floor(Math.random() * JITTER_MS);
  await new Promise((resolve) => setTimeout(resolve, delay));

  const clip = CLIPS[generationId % CLIPS.length] ?? CLIPS[0];
  return {
    videoUrl: `${baseUrl}/dev-clips/${clip}.mp4`,
    requestId: `dryrun_${generationId}`,
    timings: { inference: delay / 1000 },
  };
}
