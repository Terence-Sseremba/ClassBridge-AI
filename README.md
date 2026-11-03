# ClassBridge AI — Milestone 01

A mobile-first classroom accessibility prototype built with React, TypeScript, Vite, Tailwind CSS, and IndexedDB.

## Run locally

```bash
npm install
npm run dev
```

Use `npm run build` and `npm run lint` to check the project. On Windows PowerShell installations that block `npm.ps1`, use `npm.cmd` instead of `npm`.

## Try the foundation

1. On Home, name a class and choose **Sample class** or **Microphone**.
2. Sample class uses simulated captions. Microphone streams audio to Meta Muse Voice Transcribe through the local ClassBridge server. Pause or bookmark captions; **Catch me up** remains a mock recap.
3. Select **Save & finish**. The lesson is stored in this browser's IndexedDB.
4. Open **My sessions** or the saved study view. Review the transcript, add notes, and try the clearly labeled **mock AI** study helper.

Sessions are local to the current browser profile. Clearing browser site data removes them. Only completed Muse transcript turns are saved. Speaker names are not identified. Catch-up and study responses remain mock features.

## Muse Voice microphone setup

1. Use Node.js 24.10 or later (or 22.21 or later) and run `npm install`.
2. Copy `.env.example` to a root `.env` file and replace the placeholder with your Meta Model API key. Keep the file private. Alternatively, set `MODEL_API_KEY` in the backend PowerShell environment. An existing environment variable takes precedence over `.env`, so remove an old PowerShell value before testing the file.
3. Start the backend with `npm run dev:server`.
4. In a second terminal, start the frontend with `npm run dev`. Open `http://localhost:5173`, choose **Microphone**, and allow microphone access.

PowerShell setup (paste the real key into `.env` in a local editor; do not commit it):

```powershell
Copy-Item .env.example .env
notepad .env
Remove-Item Env:MODEL_API_KEY -ErrorAction SilentlyContinue
npm.cmd run dev:server
```

The existing PowerShell method also remains valid: set `$env:MODEL_API_KEY` in that terminal, then run `npm.cmd run dev:server`. Never place the key in a `VITE_` variable or frontend file. The backend loads the key at startup and never sends it to the browser. `.env` and `.env.local` are ignored by Git.

If the backend reports a Meta connection timeout before `meta_socket_open`, run `npm.cmd run diagnose:network`. This credential-free check reports whether DNS resolution, direct TCP port 443, and TLS negotiation to `api.meta.ai` succeed. It reports only proxy-environment presence and sanitized error codes; it does not read the API key. A TCP failure means the Meta handshake and key have not been tested yet.

The frontend's `/api/transcription` WebSocket is proxied by Vite to the backend on `127.0.0.1:8787`. The browser sends raw 24 kHz mono signed 16-bit PCM frames to that local endpoint. The backend opens Meta's realtime WebSocket, puts the key in its first handshake frame, streams the PCM frames, and returns partial and completed transcript turns. Meta may process the streamed audio according to your Meta account settings. Microphone capture requires HTTPS or localhost. For testing from another device, configure HTTPS and set `CLASSBRIDGE_ALLOWED_ORIGIN` to that exact frontend origin before starting the backend. The server is intended for local development and has no user authentication.

The realtime path was manually verified with a laptop microphone on a working mobile hotspot. Live captions appeared, multiple finalized segments were saved, and the saved session reopened with its transcript.

## Project map

- `src/types/lesson.ts` — shared lesson shape and timestamp formatting.
- `src/storage/lessons.ts` — small IndexedDB adapter.
- `src/services/transcription.ts` — transcription interface and sample caption source.
- `src/services/museTranscription.ts` — microphone capture, local WebSocket client, and caption lifecycle.
- `public/pcm-worklet.js` — 24 kHz mono PCM conversion.
- `server/index.mjs` — local key-protecting Meta WebSocket proxy.
- `src/services/reasoning.ts` — catch-up/study interface and mock responses.
- `src/App.tsx` — four screens and their state transitions.
- `src/styles.css` — Tailwind entry point and responsive component styling.

The service interfaces are intended for later integration behind a trusted backend. Keep API keys and provider calls out of the browser client.
