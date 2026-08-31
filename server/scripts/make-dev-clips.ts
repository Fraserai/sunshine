/**
 * Generates the placeholder clips used by VISUAL_DRY_RUN. Run once; the output is
 * committed so nobody needs ffmpeg to develop against the dry-run path.
 *
 * Each clip is a distinct colour with a sweeping bar, so during testing it is
 * obvious at a glance which generation actually reached the screen — which is the
 * whole point when verifying crossfades and stale-generation protection.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

// ffmpeg-static is CJS and exports the binary path as its default; the bundled
// types describe the module namespace instead, so narrow it here.
const ffmpegPath = ffmpegStatic as unknown as string | null;

const OUT = path.join(import.meta.dirname, "..", "assets", "dev");

// 768P vertical, matching the real H3 Max output shape.
const WIDTH = 768;
const HEIGHT = 1344;
const SECONDS = 5;

const CLIPS: Array<{ name: string; color: string }> = [
  { name: "clip-1", color: "0x14213D" },
  { name: "clip-2", color: "0x3D1420" },
  { name: "clip-3", color: "0x143D22" },
  { name: "clip-4", color: "0x3D3414" },
  { name: "clip-5", color: "0x2A143D" },
];

function main(): void {
  if (!ffmpegPath) throw new Error("ffmpeg-static did not resolve a binary path");
  mkdirSync(OUT, { recursive: true });

  for (const [i, clip] of CLIPS.entries()) {
    const out = path.join(OUT, `${clip.name}.mp4`);
    const sweep = `drawbox=x=0:y='mod(t*${HEIGHT / SECONDS}\\,${HEIGHT})':w=${WIDTH}:h=14:color=white@0.85:t=fill`;
    const marker = `drawbox=x=${40 + i * 90}:y=${HEIGHT / 2 - 45}:w=90:h=90:color=white@0.9:t=fill`;

    execFileSync(
      ffmpegPath,
      [
        "-y",
        "-f", "lavfi",
        "-i", `color=c=${clip.color}:s=${WIDTH}x${HEIGHT}:d=${SECONDS}:r=24`,
        "-vf", `${sweep},${marker}`,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "34",
        "-movflags", "+faststart",
        "-an",
        out,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    console.log(`  ${clip.name}.mp4`);
  }
  console.log(`\n  ${CLIPS.length} placeholder clips written to assets/dev\n`);
}

main();
