/**
 * Creates or updates the Sunshine ElevenLabs agent from src/elevenlabs/agentConfig.ts.
 *
 *   npm run provision:agent            # create a new agent, print its id
 *   npm run provision:agent -- --update  # patch the agent in ELEVENLABS_AGENT_ID
 */
import "dotenv/config";
import { buildAgentPayload } from "../src/elevenlabs/agentConfig.js";

const API = "https://api.elevenlabs.io/v1/convai/agents";

async function main(): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("ELEVENLABS_API_KEY is not set. Add it to server/.env first.");
    process.exit(1);
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "cjVigY5qzO86Huf0OWal";
  const update = process.argv.includes("--update");
  const agentId = process.env.ELEVENLABS_AGENT_ID;

  if (update && !agentId) {
    console.error("--update needs ELEVENLABS_AGENT_ID in server/.env.");
    process.exit(1);
  }

  const url = update ? `${API}/${agentId}` : `${API}/create`;
  const payload = buildAgentPayload(voiceId);

  const res = await fetch(url, {
    method: update ? "PATCH" : "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`\n${update ? "Update" : "Create"} failed (${res.status}):\n${text}\n`);
    process.exit(1);
  }

  const body = JSON.parse(text) as { agent_id?: string };
  const id = body.agent_id ?? agentId;

  console.log(`\n  Agent ${update ? "updated" : "created"}: ${id}`);
  console.log(`  LLM:   gpt-5.6-sol`);
  console.log(`  TTS:   eleven_v3_conversational (voice ${voiceId})`);
  console.log(`  Tool:  direct_visual (client, expects_response=false)`);
  console.log(`  Auth:  private (server-minted WebRTC token required)`);
  if (!update) {
    console.log(`\n  Put this in server/.env:\n    ELEVENLABS_AGENT_ID=${id}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
