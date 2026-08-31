/**
 * Headless verification of VisualEngine's ordering guarantees.
 *
 * These are the properties the product cannot ship without: a slow generation
 * must never overwrite a newer one, clear must invalidate everything in flight,
 * and continuous mode must stay bounded. Run with `npm run test:engine`.
 */
(globalThis as Record<string, unknown>).__DEV__ = false;
process.env.EXPO_PUBLIC_API_BASE_URL ??= "http://test.local";
process.env.EXPO_PUBLIC_VISUAL_MAX_AUTO_SEGMENTS ??= "3";

interface Scheduled {
  delayMs: number;
  videoUrl: string;
}

/** action+prompt keyed responses so each scenario can control timing precisely. */
const responses: Scheduled[] = [];
const calls: Array<{ action: string; prompt: string; generationId: number; previousVideoUrl?: string }> = [];

globalThis.fetch = (async (_url: string, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? "{}"));
  calls.push(body);
  const plan = responses.shift() ?? { delayMs: 5, videoUrl: `https://cdn/${body.generationId}.mp4` };
  await new Promise((r) => setTimeout(r, plan.delayMs));
  return {
    ok: true,
    json: async () => ({
      generationId: body.generationId,
      videoUrl: plan.videoUrl,
      requestId: `req_${body.generationId}`,
      serverTiming: { totalMs: plan.delayMs, generateMs: plan.delayMs },
    }),
  } as unknown as Response;
}) as typeof fetch;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n          expected ${JSON.stringify(expected)}\n          actual   ${JSON.stringify(actual)}`}`);
}

async function main(): Promise<void> {
  const { VisualEngine } = await import("../src/visual/VisualEngine.js");

  // Drives the engine the way VideoCanvas does once a clip is buffered.
  const show = (engine: InstanceType<typeof VisualEngine>) => {
    const s = engine.getSnapshot();
    const preload = s.slots[s.activePlayer === "a" ? "b" : "a"];
    if (!preload) return null;
    engine.notifyPreloadReady(preload);
    engine.notifyVisible(preload);
    return preload;
  };

  console.log("\nA. new visual reaches the screen");
  {
    const e = new VisualEngine();
    responses.push({ delayMs: 10, videoUrl: "https://cdn/supernova.mp4" });
    e.direct({ action: "new", prompt: "a star collapsing", continuous: false });
    await sleep(60);
    show(e);
    check("current video", e.getSnapshot().currentVideoUrl, "https://cdn/supernova.mp4");
    check("state", e.getSnapshot().state, "playing");
    check("visible", e.getSnapshot().videoVisible, true);
  }

  console.log("\nB. stale generation cannot overwrite a newer one");
  {
    calls.length = 0;
    const e = new VisualEngine();
    // Supernova is slow; Rome is issued afterwards but finishes first.
    responses.push({ delayMs: 400, videoUrl: "https://cdn/supernova.mp4" });
    responses.push({ delayMs: 40, videoUrl: "https://cdn/rome.mp4" });

    e.direct({ action: "new", prompt: "a star collapsing", continuous: false });
    const staleEpoch = e.getSnapshot().epoch;
    await sleep(20);
    e.direct({ action: "new", prompt: "ancient rome at sunrise", continuous: false });
    const freshEpoch = e.getSnapshot().epoch;
    check("epoch advanced", freshEpoch > staleEpoch, true);

    await sleep(120);
    show(e);
    check("rome is on screen", e.getSnapshot().currentVideoUrl, "https://cdn/rome.mp4");

    // Let the superseded supernova render land well after the fact.
    await sleep(500);
    check("supernova never appears", e.getSnapshot().currentVideoUrl, "https://cdn/rome.mp4");
    check("supernova not preloaded either", e.getSnapshot().nextVideoUrl, null);
    check("epoch unchanged by stale result", e.getSnapshot().epoch, freshEpoch);
  }

  console.log("\nC. continue sends the previous clip for last-frame extraction");
  {
    calls.length = 0;
    const e = new VisualEngine();
    responses.push({ delayMs: 10, videoUrl: "https://cdn/core-1.mp4" });
    e.direct({ action: "new", prompt: "inside a star", continuous: false });
    await sleep(50);
    show(e);

    responses.push({ delayMs: 10, videoUrl: "https://cdn/core-2.mp4" });
    e.direct({ action: "continue", prompt: "deeper into the core", continuous: false });
    await sleep(50);

    const last = calls[calls.length - 1]!;
    check("action", last.action, "continue");
    check("previousVideoUrl", last.previousVideoUrl, "https://cdn/core-1.mp4");
  }

  console.log("\nD. continue with nothing on screen degrades to new");
  {
    calls.length = 0;
    const e = new VisualEngine();
    e.direct({ action: "continue", prompt: "go deeper", continuous: false });
    await sleep(30);
    check("action rewritten", calls[0]!.action, "new");
    check("no previous url", calls[0]!.previousVideoUrl, undefined);
  }

  console.log("\nE. clear invalidates everything in flight");
  {
    const e = new VisualEngine();
    responses.push({ delayMs: 10, videoUrl: "https://cdn/first.mp4" });
    e.direct({ action: "new", prompt: "a jet engine", continuous: false });
    await sleep(50);
    show(e);
    check("showing", e.getSnapshot().videoVisible, true);

    responses.push({ delayMs: 300, videoUrl: "https://cdn/late.mp4" });
    e.direct({ action: "continue", prompt: "inside the combustor", continuous: false });
    await sleep(20);
    e.clear();
    check("hidden immediately", e.getSnapshot().videoVisible, false);
    check("state", e.getSnapshot().state, "idle");

    await sleep(450);
    check("late render discarded", e.getSnapshot().currentVideoUrl, null);
    check("slots released", e.getSnapshot().slots, { a: null, b: null });
  }

  console.log("\nF. continuous mode chains ahead and stays bounded");
  {
    calls.length = 0;
    const e = new VisualEngine();
    e.direct({ action: "new", prompt: "a process unfolding", continuous: true });

    // Each time a segment becomes visible the engine should queue exactly one more,
    // up to EXPO_PUBLIC_VISUAL_MAX_AUTO_SEGMENTS (3 here).
    for (let i = 0; i < 8; i += 1) {
      await sleep(40);
      const url = show(e);
      if (!url) continue;
      e.notifyClipEnded(url);
    }
    await sleep(120);

    check("segment cap respected", e.getSnapshot().segment, 3);
    check("total generations", calls.length, 3);
    check("chained with continue", calls.slice(1).every((c) => c.action === "continue"), true);
    check("never more than one in flight", e.getSnapshot().inFlight <= 1, true);
  }

  console.log("\nG. a failed generation leaves the current scene alone");
  {
    const e = new VisualEngine();
    responses.push({ delayMs: 10, videoUrl: "https://cdn/keep-me.mp4" });
    e.direct({ action: "new", prompt: "a coral reef", continuous: false });
    await sleep(50);
    show(e);

    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    e.direct({ action: "redirect", prompt: "pull back", continuous: false });
    await sleep(60);
    globalThis.fetch = realFetch;

    check("scene retained", e.getSnapshot().currentVideoUrl, "https://cdn/keep-me.mp4");
    check("still visible", e.getSnapshot().videoVisible, true);
    check("error surfaced to debug only", typeof e.getSnapshot().lastError, "string");
  }

  console.log(`\n${failures === 0 ? "All engine guarantees hold." : `${failures} check(s) failed.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
