/** Verifies the private agent will mint a WebRTC token for us. */
import "dotenv/config";
import { mintConversationToken } from "../src/elevenlabs/token.js";

const t0 = Date.now();
const { token, conversationId, agentId } = await mintConversationToken();
console.log(`agent           ${agentId}`);
console.log(`conversation    ${conversationId}`);
console.log(`token           ${token.slice(0, 12)}… (${token.length} chars)`);
console.log(`latency         ${Date.now() - t0}ms`);
