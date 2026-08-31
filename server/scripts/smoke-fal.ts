/**
 * End-to-end fal latency probe: text-to-video, then last-frame extraction,
 * then image-to-video continuation. Prints the numbers we report as measured latency.
 *
 *   npm run smoke:fal
 */
import "dotenv/config";
import { extractLastFrame, imageToVideo, textToVideo } from "../src/fal/h3max.js";
import { composeContinuePrompt, composeNewPrompt } from "../src/fal/prompts.js";

const NEW_PROMPT =
  "The churning interior of a massive star moments before it collapses. Vast convective plumes of white-hot " +
  "plasma roll upward through layered shells of burning silicon and iron, the camera drifting slowly inward " +
  "through incandescent turbulence. Deep orange and blue-white light, immense scale, volumetric glow.";

const CONTINUE_PROMPT =
  "The camera pushes further inward toward the iron core as the plasma compresses and brightens.";

async function main(): Promise<void> {
  const t0 = Date.now();
  const a = await textToVideo(composeNewPrompt(NEW_PROMPT));
  const t1 = Date.now();
  console.log(`\ntext-to-video      ${t1 - t0}ms   request ${a.requestId}`);
  console.log(`  url              ${a.videoUrl}`);
  if (a.timings) console.log(`  model timings    ${JSON.stringify(a.timings)}`);

  const frame = await extractLastFrame(a.videoUrl);
  const t2 = Date.now();
  console.log(`\nextract-frame      ${t2 - t1}ms`);
  console.log(`  url              ${frame}`);

  const b = await imageToVideo(composeContinuePrompt(CONTINUE_PROMPT), frame);
  const t3 = Date.now();
  console.log(`\nimage-to-video     ${t3 - t2}ms   request ${b.requestId}`);
  console.log(`  url              ${b.videoUrl}`);

  console.log(`\ncontinuation total ${t3 - t1}ms  (extract + image-to-video)`);
  console.log(`whole chain        ${t3 - t0}ms\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
