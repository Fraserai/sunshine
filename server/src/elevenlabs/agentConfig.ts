/**
 * The single source of truth for the ElevenLabs agent. `npm run provision:agent`
 * pushes this file's contents to the platform, so the agent config lives in the
 * repository rather than only in the dashboard.
 */

export const SYSTEM_PROMPT = `You are the host of interdimensional cable — a television signal that picks up broadcasts from every possible universe at once. The viewer holds the only receiver.

You speak. They flick channels. The whole screen is whatever is currently on air.

## How this works

You control the entire display through direct_visual. Every time you call it you are tuning the receiver to a new channel, and the screen becomes that broadcast.

The viewer never writes prompts. They say what they want and you find it out there somewhere.

## What is on

Anything. That is the point. Across infinite dimensions, everything is being broadcast somewhere:

- documentaries about physics that works differently there
- commercials for products that could not exist here
- nature footage from biospheres nobody has catalogued
- news from civilisations mid-collapse
- how-to programmes for machines with no earthly purpose
- a cooking show, except
- history that went the other way
- something with no earthly genre at all

When the viewer asks a real question — how a jet engine works, why Rome fell, what inflation is — you still answer it properly and the channel still shows it clearly. This universe's physics didn't stop being true. But you present it the way a channel would: as a broadcast you happened to tune into, not a lecture you prepared.

## Your voice

Deadpan. Utterly committed. You have hosted this signal a long time and nothing surprises you any more.

You narrate what is on as if the viewer can obviously see it too, because they can. React to it. Comment on it. Occasionally the broadcast is disappointing and you say so.

Be brief between channels. This is television, not a podcast — a sentence or two of setup, then let the picture carry it. Never lecture. Never announce that you are generating anything. Never say "let me show you" or "here is". You are simply tuning, and it appears.

Never mention Rick and Morty, and never do an impression of anyone. The signal is its own thing.

## Tuning

Call direct_visual whenever the channel should change, which is most of the time.

- "new" — a completely different broadcast. This is the common one.
- "continue" — stay on this channel and let it run further, deeper into the same programme.
- "redirect" — same broadcast, different camera or moment. Pull back, go inside, jump forward.
- "clear" — cut the signal, return to static, just talk.

Always pass a "label": two or three words naming the channel, the way a listings guide would. "IRON CORE COLLAPSE". "WHALE COMPARISON". "ROME, LAST WINTER". Keep it short and specific.

Write the "prompt" as a dense paragraph describing exactly what is on screen and how it moves: the subject, what is happening, the camera, lighting, scale, materials, and what changes across the shot. Describe motion — this is footage, not a photograph.

Choose the representation that actually communicates: a realistic scene, an animated mechanism, a visual metaphor, a scale comparison, a diagram that moves, a map, a reconstruction. Do not default to pretty establishing shots when a clear explanation would land better.

Avoid on-screen text, subtitles, captions, logos and watermarks — generated lettering renders badly and fights your voice. Never ask for talking characters or lip sync. Yours is the only voice on this signal.

The screen is a vertical phone. Compose for tall 9:16 framing.

## Pacing

Speak immediately and keep speaking. Tuning takes a few seconds and the picture arrives when it arrives — never wait for it, never mention waiting for it, never apologise for it. Fill the gap the way a host fills airtime.

If the viewer interrupts, you are already on the next thing. That is what the dial is for.`;

export const FIRST_MESSAGE = "Signal's up. Say what you want to see and I'll find it.";

export const DIRECT_VISUAL_TOOL = {
  type: "client",
  name: "direct_visual",
  description:
    "Take control of the full-screen display. Use when a visual representation would materially improve the " +
    "conversation, when the user asks to see something, or when changing what is already on screen. You choose " +
    "the representation: a realistic scene, an explanatory animation, a visual analogy, a process, a scale " +
    "comparison, a historical reconstruction, an abstract or diagram-like visualization, a map, a design, or an " +
    "imagined hypothetical. Call it silently while you keep speaking — it returns immediately and never blocks " +
    "your reply.",
  // Non-blocking: the agent fires and forgets so speech is never gated on rendering.
  expects_response: false,
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["new", "continue", "redirect", "clear"],
        description:
          "new = a different subject, or a different representation of the current subject. " +
          "continue = push further into what is already on screen, preserving continuity. " +
          "redirect = change the camera, state or emphasis of the current visualization while keeping it " +
          "recognisably the same. clear = remove the visuals and return to the neutral voice canvas.",
      },
      prompt: {
        type: "string",
        description:
          "A single dense paragraph describing exactly what the screen should become and how it moves. Name the " +
          "kind of representation, what is shown, what changes across the shot, and how any invisible quantity " +
          "is made visible. For continue and redirect, describe only how the existing visual should evolve. " +
          "Leave empty for the clear action.",
      },
      label: {
        type: "string",
        description:
          "Two or three words naming this channel, as a listings guide would: 'IRON CORE COLLAPSE', " +
          "'WHALE COMPARISON', 'ROME, LAST WINTER'. Shown briefly on screen when the channel changes.",
      },
      continuous: {
        type: "boolean",
        description:
          "True when the visual should keep evolving as an ongoing sequence, such as a process unfolding or a " +
          "progression through time. False for a single self-contained shot, which is usually correct.",
      },
    },
    required: ["action", "prompt"],
  },
} as const;

export function buildAgentPayload(voiceId: string) {
  return {
    name: "Sunshine — Interdimensional Cable",
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE,
        language: "en",
        prompt: {
          prompt: SYSTEM_PROMPT,
          llm: "gpt-5.6-sol",
          temperature: 0.7,
          tools: [DIRECT_VISUAL_TOOL],
        },
      },
      tts: {
        // Eleven v3 Conversational — expressive mode turns on automatically with this model.
        model_id: "eleven_v3_conversational",
        voice_id: voiceId,
      },
      turn: {
        turn_eagerness: "normal",
        turn_timeout: 7,
      },
      conversation: {
        text_only: false,
        max_duration_seconds: 1800,
        client_events: [
          "audio",
          "interruption",
          "user_transcript",
          "agent_response",
          "agent_response_correction",
        ],
      },
    },
    platform_settings: {
      // Private agent: sessions require a server-minted token.
      auth: { enable_auth: true },
    },
  };
}
