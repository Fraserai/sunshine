import "dotenv/config";
import { z } from "zod";

/**
 * All secrets live here and never leave the server process.
 * The mobile bundle only ever learns EXPO_PUBLIC_API_BASE_URL.
 */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  ELEVENLABS_API_KEY: z.string().min(1, "ELEVENLABS_API_KEY is required"),
  ELEVENLABS_AGENT_ID: z.string().min(1, "ELEVENLABS_AGENT_ID is required"),
  FAL_KEY: z.string().min(1, "FAL_KEY is required"),

  /** 768P is the product default. 480P exists purely as a debugging escape hatch. */
  VISUAL_RESOLUTION: z.enum(["480P", "768P"]).default("768P"),
  VISUAL_DURATION_SECONDS: z.coerce.number().int().min(1).max(10).default(5),
  VISUAL_PROMPT_EXPANSION: z.enum(["balanced", "quality"]).default("balanced"),
  /** Hard ceiling on a single fal round trip before we give up and let voice carry on. */
  VISUAL_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),

  /**
   * Retries after a transient fal failure. Every retry is a second BILLED generation,
   * and a timeout retry can bill twice for work that also completes. Defaults to 0.
   */
  VISUAL_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(0),

  /**
   * Serves local placeholder clips instead of calling fal. Nothing is billed.
   * Lets the full on-device experience — crossfade, preload, epochs, staleness,
   * interruption — be exercised for free.
   */
  VISUAL_DRY_RUN: z
    .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
    .default("false")
    .transform((v) => v === "true" || v === "1"),

  /** Base URL the dry-run placeholder clips are served from, as the phone sees it. */
  PUBLIC_BASE_URL: z.string().default(""),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server environment:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
  }
  cached = parsed.data;
  return cached;
}
