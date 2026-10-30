# ClassBridge AI — Milestone 01

A mobile-first classroom accessibility prototype built with React, TypeScript, Vite, Tailwind CSS, and IndexedDB.

## Run locally

```bash
npm install
npm run dev
```

Use `npm run build` and `npm run lint` to check the project. On Windows PowerShell installations that block `npm.ps1`, use `npm.cmd` instead of `npm`.

## Try the foundation

1. On Home, name and start a sample class.
2. Watch the **simulated** captions appear. Pause playback, bookmark a line, or select **Catch me up** for a **mock** recap of recent captions.
3. Select **Save & finish**. The lesson is stored in this browser's IndexedDB.
4. Open **My sessions** or the saved study view. Review the transcript, add notes, and try the clearly labeled **mock AI** study helper.

Sessions are local to the current browser profile. Clearing browser site data removes them. No microphone, transcription API, AI API, or cloud service is connected in this milestone.

## Project map

- `src/types/lesson.ts` — shared lesson shape and timestamp formatting.
- `src/storage/lessons.ts` — small IndexedDB adapter.
- `src/services/transcription.ts` — transcription interface and sample caption source.
- `src/services/reasoning.ts` — catch-up/study interface and mock responses.
- `src/App.tsx` — four screens and their state transitions.
- `src/styles.css` — Tailwind entry point and responsive component styling.

The service interfaces are intended for later integration behind a trusted backend. Keep API keys and provider calls out of the browser client.
