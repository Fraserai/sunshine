const rawBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

if (!rawBaseUrl) {
  console.warn(
    "[sunshine] EXPO_PUBLIC_API_BASE_URL is not set. Copy mobile/.env.example to mobile/.env " +
      "and point it at your backend, then restart the bundler.",
  );
}

export const API_BASE_URL = (rawBaseUrl ?? "http://localhost:8787").replace(/\/+$/, "");

const parsedMaxSegments = Number(process.env.EXPO_PUBLIC_VISUAL_MAX_AUTO_SEGMENTS);

/**
 * Ceiling on unattended continuation. Every segment is a paid generation, so the
 * default is 1 — meaning no automatic continuation at all, only what the agent
 * explicitly asks for. Raise it deliberately, never by accident.
 * A fresh direct_visual command resets the count.
 */
export const VISUAL_MAX_AUTO_SEGMENTS =
  Number.isFinite(parsedMaxSegments) && parsedMaxSegments > 0 ? Math.floor(parsedMaxSegments) : 1;

export const IS_DEV = __DEV__;

/** Clip-to-clip crossfade. Short, so a continuous world reads as one unbroken take. */
export const CROSSFADE_MS = 260;

/**
 * Idle canvas to first video. Deliberately slower than a clip swap — this is the
 * moment the screen becomes the subject, and cutting to it feels like a glitch.
 */
export const REVEAL_MS = 900;
