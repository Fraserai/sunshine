# Sunshine

A full-screen generative visual canvas directed by a natural voice conversation.

You talk. The AI talks back. When showing you something would explain it better than
words, the AI silently decides what the entire display should become — and the screen
becomes it.

There is no feed, no chat, no settings. One screen, one conversation, one canvas.

---

## Architecture

```
  iPhone microphone
         │
         ▼
  ElevenLabs Agent  ──────────────────────────────────┐
         │  (WebRTC / LiveKit, private agent)         │
         ├──► GPT-5.6 Sol                             │
         │       ├──► spoken response ────────────────┤
         │       └──► client tool: direct_visual(…)   │
         │                    │                       ▼
         │                    │              ElevenLabs voice audio
         │                    │                       │
         │                    │                       ▼
         │                    │                iPhone speaker
         │                    ▼
         │            VisualEngine  (mobile/src/visual/VisualEngine.ts)
         │            mints an epoch, returns immediately
         │                    │
         │                    ▼
         │            POST /api/visual/generate        server/
         │                    │
         │        ┌───────────┴───────────┐
         │        │                       │
         │     action=new          action=continue | redirect
         │        │                       │
         │        │              fal-ai/ffmpeg-api/extract-frame
         │        │                  (frame_type: "last")
         │        │                       │
         │        ▼                       ▼
         │  minimax/h3-max/        minimax/h3-max/
         │   text-to-video          image-to-video
         │   9:16 · 768P · 5s        (inherits 9:16 from frame)
         │        └───────────┬───────────┘
         │                    ▼
         │                video URL
         │                    │
         │                    ▼
         │        epoch still current?  ── no ──► discarded, never shown
         │                    │ yes
         │                    ▼
         │       preload into the off-screen player
         │                    │
         │                    ▼
         │          crossfade (220ms) · muted · cover
         ▼                    ▼
  GET /api/voice/token   full-screen iPhone video
  (server-minted WebRTC token — no API key on device)
```

The voice path and the visual path never block each other. `direct_visual` queues work
and returns instantly, so the agent keeps speaking while a render is in flight. If fal is
slow, queued or failing, the conversation is unaffected.

### The one invariant

Every visual command mints a new monotonically increasing **epoch**. A generation result
is applied only if its epoch is still current. Exactly one generation is ever in flight.
So when you interrupt mid-render, the superseded clip is dropped on the floor — it can
never appear after the thing you actually asked for.

`npm test` verifies this headlessly, including the rapid-interruption case.

---

## Measured latency

Real H3 Max, 9:16, 768P, 5s clips, measured 31 Aug 2026:

| Step | Wall clock | Model-reported inference |
| --- | --- | --- |
| `text-to-video` (a new visual) | **7.00s** | 2.96s |
| `extract-frame` (last frame) | **2.93s** | — |
| `image-to-video` (a continuation) | **6.99s** | — |
| Continuation total (extract + generate) | **9.92s** | — |

Output verified as `768x1344` — exactly 9:16 — 5.18s at 24fps, **with an AAC audio track**,
which is why muting the player is not optional.

Two consequences worth knowing:

- **A new visual is ~7s from tool call to video URL**, before preload and crossfade. The
  agent talks over that gap by design, which is the entire reason voice and visuals are
  decoupled.
- **Continuous mode cannot stay ahead of playback.** Generating the next 5s clip takes
  ~7s, so a continuous chain will run dry for ~2s per segment. The engine handles this
  correctly — it holds the final frame rather than flashing black, and crossfades when the
  next clip lands — but the brief's assumption that generation outruns playback does not
  hold at current H3 Max latency.

---

## Layout

```
server/                     tiny TypeScript backend — holds every secret
  src/
    routes/voice.ts         GET  /api/voice/token      mints a WebRTC token
    routes/visual.ts        POST /api/visual/generate  H3 Max + frame extraction
    elevenlabs/
      token.ts              private-agent token minting
      agentConfig.ts        the agent's system prompt + direct_visual tool, in git
    fal/
      h3max.ts              text-to-video, image-to-video, extract-frame
      prompts.ts            prompt composition and negative tails
  scripts/
    provision-agent.ts      creates/updates the agent from agentConfig.ts
    smoke-fal.ts            measures real generation latency
    smoke-voice.ts          verifies the private agent mints a token

mobile/                     Expo / React Native, iPhone-first, portrait only
  App.tsx
  src/
    screens/CanvasScreen.tsx    the entire product, one screen
    visual/VisualEngine.ts      epochs, staleness, preload, continuation
    voice/useVoiceSession.ts    ElevenLabs session + direct_visual registration
    components/
      VideoCanvas.tsx           two players, crossfade, muted, cover
      IdleCanvas.tsx            the neutral canvas
      VoiceControl.tsx          the only chrome
      DebugOverlay.tsx          dev builds only
    lib/{api,config,log}.ts
  scripts/engine-test.ts        headless ordering guarantees
```

---

## Environment variables

### `server/.env` — secrets, never committed, never shipped to the device

| Variable | Where to get it |
| --- | --- |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io/app/settings/api-keys |
| `ELEVENLABS_AGENT_ID` | printed by `npm run provision:agent` |
| `FAL_KEY` | https://fal.ai/dashboard/keys |

Optional tuning: `PORT` (8787), `VISUAL_RESOLUTION` (`768P`, set `480P` only to cut cost
while debugging), `VISUAL_DURATION_SECONDS` (5), `VISUAL_PROMPT_EXPANSION` (`balanced`),
`VISUAL_TIMEOUT_MS` (120000), `ELEVENLABS_VOICE_ID`.

### Cost control

fal generations cost real money, so the defaults are deliberately conservative.

| Variable | Default | Effect |
| --- | --- | --- |
| `VISUAL_DRY_RUN` | `true` | Serves local placeholder clips instead of calling fal. **Nothing is billed.** |
| `VISUAL_MAX_RETRIES` | `0` | Retries after a transient failure. Each one is a second billed generation. |
| `EXPO_PUBLIC_VISUAL_MAX_AUTO_SEGMENTS` | `1` | `1` means no automatic continuation at all — only what the agent explicitly asks for. |

**Dry-run mode is the default.** It exercises the entire experience — crossfade,
dual-player preload, epochs, stale-generation protection, rapid interruption — against
five locally served 9:16 placeholder clips, with a simulated 3.5–5.3s render delay so the
preload timing is realistic. Each clip is a distinct colour, so it is obvious at a glance
which generation actually reached the screen.

Set `VISUAL_DRY_RUN=false` only when you intend to spend money.

The placeholder clips live in `server/assets/dev/` (60KB total) and are committed.
Regenerate them with `npm run make:dev-clips` if you ever need to.

`npm test` never touches the network — it replaces `globalThis.fetch` outright.

### `mobile/.env` — client-safe only

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | `http://<your-mac-LAN-ip>:8787` for a physical iPhone |
| `EXPO_PUBLIC_VISUAL_MAX_AUTO_SEGMENTS` | `4` — ceiling on unattended continuation |

Anything `EXPO_PUBLIC_*` is embedded in the app bundle. No API key ever goes here.

---

## Running it

```bash
npm run install:all
cp server/.env.example server/.env      # fill in the two keys
cp mobile/.env.example mobile/.env      # point at your Mac's LAN IP
```

Create the agent (prints the id to paste into `server/.env`):

```bash
npm run provision:agent
```

Start the backend:

```bash
npm run server
```

Check the voice path before touching the phone (free):

```bash
npm run smoke:voice     # private agent mints a WebRTC token
```

`npm run smoke:fal` measures real H3 Max latency end to end, but it performs **two paid
generations plus one frame extraction**. Only run it when you mean to.

### Onto a physical iPhone (free Apple ID / Personal Team)

The ElevenLabs SDK pulls in LiveKit/WebRTC native modules, so **Expo Go will not work** —
this needs a development build compiled locally with Xcode.

Nothing in this app requires a paid Apple Developer account. The entitlements file is
empty and no capability needs provisioning, so a free Apple ID signing as a *Personal
Team* is enough.

Check where you are at any point:

```bash
npm run preflight
```

**1 — Xcode.** Install from the App Store, then **open it once** and let it install its
additional components. Then point the command-line tools at it:

```bash
sudo xcode-select -s /Applications/Xcode.app
```

**2 — CocoaPods.** The iOS build needs it, and macOS system Ruby is too old to install a
current version cleanly. Homebrew is the reliable route:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install cocoapods
```

**3 — Sign in to Xcode.** Xcode → Settings → Accounts → **+** → Apple ID. Sign in with
your normal Apple ID. A team called *"Your Name (Personal Team)"* appears — that is the
free tier, and it is all this app needs.

**4 — Set the signing team.** Generate the native project and open the workspace:

```bash
cd mobile
npx expo prebuild --platform ios --clean
open ios/Sunshine.xcworkspace
```

Select the **Sunshine** target → **Signing & Capabilities** → tick *Automatically manage
signing* → choose your Personal Team. The bundle identifier is
`com.caeseyfraser.sunshine`, which is unique to you — do not change it. Free accounts get
only 10 App ID registrations per 7 days, so churning identifiers is expensive.

**5 — Developer Mode on the iPhone.** Connect the phone by cable, unlock it, and tap
**Trust This Computer**. Developer Mode only appears in Settings *after* the phone has
been connected to Xcode, so do this step in order:

Settings → Privacy & Security → **Developer Mode** → on → the phone restarts → confirm
after unlocking.

**6 — Build.** In Xcode, pick your iPhone from the device menu and press **Run** (⌘R).
The first build takes a while — it compiles WebRTC.

**7 — Trust the certificate.** The first launch fails with "Untrusted Developer". On the
phone: Settings → General → **VPN & Device Management** → your Apple ID → **Trust**.
Launch the app again.

After that first Xcode build, JS changes need no rebuild:

```bash
npm run server          # in one terminal, from the repo root
cd mobile && npx expo start --dev-client
```

#### Two Personal Team limits worth knowing

- **Provisioning profiles expire after 7 days.** The app stops launching and you rebuild
  from Xcode. This is a free-account restriction, not a bug in the project.
- **Three apps maximum** installed via a free account at once.

## The ElevenLabs agent

`npm run provision:agent` pushes everything below from `server/src/elevenlabs/agentConfig.ts`,
so the agent config is version-controlled rather than living only in the dashboard.
Re-push edits with `npm run provision:agent -- --update`.

| Setting | Value |
| --- | --- |
| LLM | `gpt-5.6-sol` |
| TTS model | `eleven_v3_conversational` (Expressive Mode) |
| Turn eagerness | `normal` |
| Interruptions | enabled |
| Authentication | private (`platform_settings.auth.enable_auth: true`) |
| Client tool | `direct_visual`, `expects_response: false` |
| Tool parameters | `action` (`new`/`continue`/`redirect`/`clear`), `prompt` (string), `continuous` (boolean) |

`expects_response: false` is what makes the tool non-blocking: the agent fires it and
keeps talking rather than waiting for a render.

---

## Verifying

```bash
npm run verify     # typecheck (both projects) + lint + engine tests
```

`npm test` alone runs the VisualEngine ordering guarantees: stale results discarded,
clear invalidating in-flight work, continuation bounded, failures leaving the scene intact.

In development builds, tap the small badge under the Dynamic Island for a debug overlay
showing connection state, epoch, action, fal request id, latency, active/preload player,
and a timestamped timeline from tool call to first visible frame.
