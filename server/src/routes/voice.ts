import { Router } from "express";
import { mintConversationToken } from "../elevenlabs/token.js";
import { log } from "../log.js";

export const voiceRouter: Router = Router();

voiceRouter.get("/token", async (_req, res) => {
  const started = Date.now();
  try {
    const payload = await mintConversationToken();
    log.info("voice.token.minted", { conversationId: payload.conversationId, ms: Date.now() - started });
    res.json(payload);
  } catch (err) {
    log.error("voice.token.failed", { error: String(err) });
    res.status(502).json({
      error: { code: "voice_token_failed", message: "Could not start a voice session right now." },
    });
  }
});
