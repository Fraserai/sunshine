import { fal } from "@fal-ai/client";
import { loadEnv } from "../env.js";

let configured = false;

/** fal is configured lazily so scripts that never touch it can run without FAL_KEY. */
export function falClient(): typeof fal {
  if (!configured) {
    fal.config({ credentials: loadEnv().FAL_KEY });
    configured = true;
  }
  return fal;
}
