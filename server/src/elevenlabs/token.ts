import { loadEnv } from "../env.js";

const TOKEN_URL = "https://api.elevenlabs.io/v1/convai/conversation/token";

interface TokenPayload {
  token: string;
  conversation_id: string;
}

/**
 * Mints a short-lived WebRTC conversation token for the private agent.
 * This is the only reason the mobile app needs a backend for voice —
 * ELEVENLABS_API_KEY must never reach the device.
 */
export async function mintConversationToken(): Promise<{ token: string; conversationId: string; agentId: string }> {
  const env = loadEnv();
  const url = `${TOKEN_URL}?agent_id=${encodeURIComponent(env.ELEVENLABS_AGENT_ID)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs token request failed (${res.status}): ${body.slice(0, 400)}`);
  }

  const data = (await res.json()) as TokenPayload;
  if (!data.token) {
    throw new Error("ElevenLabs token response did not contain a token");
  }
  return { token: data.token, conversationId: data.conversation_id, agentId: env.ELEVENLABS_AGENT_ID };
}
