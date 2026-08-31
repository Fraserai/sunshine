import cors from "cors";
import express from "express";
import path from "node:path";
import { loadEnv } from "./env.js";
import { log } from "./log.js";
import { spendSummary } from "./fal/spend.js";
import { visualRouter } from "./routes/visual.js";
import { voiceRouter } from "./routes/voice.js";

const env = loadEnv();
const app = express();

app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    resolution: env.VISUAL_RESOLUTION,
    duration: env.VISUAL_DURATION_SECONDS,
    dryRun: env.VISUAL_DRY_RUN,
    maxRetries: env.VISUAL_MAX_RETRIES,
    falSpend: spendSummary(),
  });
});

// Placeholder clips for VISUAL_DRY_RUN. Dev-only fixtures, not product assets.
// Resolved from the package root so it works the same under tsx and the built output.
app.use("/dev-clips", express.static(path.resolve(process.cwd(), "assets", "dev")));

app.use("/api/voice", voiceRouter);
app.use("/api/visual", visualRouter);

app.use((_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "No such endpoint." } });
});

// Nothing internal leaks to the device; the real cause goes to the server log only.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error("unhandled", { error: String(err) });
  if (res.headersSent) return;
  res.status(500).json({ error: { code: "internal", message: "Something went wrong." } });
});

app.listen(env.PORT, env.HOST, () => {
  log.info("server.listening", { host: env.HOST, port: env.PORT, env: env.NODE_ENV });
});
