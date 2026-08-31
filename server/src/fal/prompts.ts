/**
 * H3 Max renders audio and will happily invent dialogue, captions and logos.
 * The agent's ElevenLabs voice owns the soundstage, so every prompt carries a
 * negative tail that pushes the model away from speech and stray on-screen text.
 *
 * The tails are deliberately representation-neutral: the same composition has to
 * serve a photoreal scene, an animated mechanism, a scale comparison and an
 * abstract visual metaphor equally well.
 */

/** Always wrong for this product, whatever the agent asked for. */
const NEVER =
  "No spoken dialogue, no talking characters, no lip sync, no voiceover, no narration, " +
  "no subtitles, no closed captions, no watermarks, no logos, no user interface elements.";

/**
 * Suppressed by default because generated lettering renders unreliably and fights
 * the voice — but a scale comparison or a labelled diagram can legitimately need it,
 * so the agent can opt back in through its own prompt.
 */
const NO_TEXT = "No written text, no labels, no numbers, no titles anywhere in the frame.";

const VERTICAL =
  "Vertical 9:16 full-frame composition for a phone screen, with the essential content clear of the extreme " +
  "bottom edge.";

/** Detects an agent prompt that genuinely wants lettering, so we stop fighting it. */
const WANTS_TEXT =
  /\b(label(l?ed|s|ling)?|caption(ed|s)?|annotat(e|ed|ion|ions)|text overlay|written text|typograph\w*|legend|axis|axes|scale bar|number(s|ed)?|readout|title card)\b/i;

function tail(prompt: string): string {
  return WANTS_TEXT.test(prompt) ? NEVER : `${NEVER} ${NO_TEXT}`;
}

export function composeNewPrompt(prompt: string): string {
  const p = prompt.trim();
  return [p, VERTICAL, tail(p)].join(" ");
}

export function composeContinuePrompt(prompt: string): string {
  const p = prompt.trim();
  return [
    "Continue directly from the supplied frame as one unbroken take.",
    "Preserve the same subject, visual style, rendering technique, colour treatment, lighting and spatial",
    "orientation as the supplied frame. Do not cut, reset the scene, or restate it from a new angle.",
    p,
    tail(p),
  ].join(" ");
}

export function composeRedirectPrompt(prompt: string): string {
  const p = prompt.trim();
  return [
    "Begin from the supplied frame and transform it smoothly according to the following direction:",
    p,
    "Keep the same visual style, rendering technique and colour treatment throughout the transformation so it",
    "reads as the same visualization changing, not a different one. Transition continuously rather than cutting.",
    tail(p),
  ].join(" ");
}
