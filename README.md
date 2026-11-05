# ClassBridge AI

**Making classroom learning more accessible for deaf and hard-of-hearing students.**

ClassBridge AI is a mobile-friendly learning application I built for the Meta Global AI Developer Hackathon 2026.

The idea came from a problem that can easily be overlooked. When a teacher is explaining something in class, a deaf or hard-of-hearing student may struggle to follow the conversation or miss an important point.

I wanted to explore how AI could help students follow what is being taught, catch up when they miss something, and return to their lessons afterward. That's where ClassBridge AI comes in.

## Try ClassBridge AI

**Live application:** https://class-bridge-ai.vercel.app

ClassBridge AI runs in the browser. You can open it on a phone or computer, allow microphone access, and start a class session. Live AI features need a working internet connection.

## What ClassBridge AI Can Do

### Live Class

Students can start a class session and follow spoken explanations through captions on their screens. The application sends microphone audio through its backend to Meta's Muse Voice transcription model.

### Catch Me Up

Sometimes a student may lose track of what the teacher is explaining. Catch Me Up uses recent completed captions and Meta's Muse Spark model to give a short explanation of what has been discussed. The explanation depends on what the application has captured.

### Study Notes

After a class is saved, ClassBridge AI can generate study notes from the captured transcript. Generation starts automatically when there are enough completed captions.

The notes include an overview, important concepts, and key takeaways. If generation fails, the student can try again without losing the saved class.

### My Sessions

Students can return to saved classes to review transcripts, bookmarks, generated study notes, and personal notes. They can also delete sessions they no longer need.

## How Meta's AI Models Are Used

ClassBridge AI uses two Meta AI models for different parts of the learning experience:

- **Muse Voice Transcribe 1.0** processes microphone audio and returns captions for the student to follow during class.
- **Muse Spark 1.3** uses captured captions to explain recent classroom discussions in Catch Me Up and organize information into Study Notes.

Both models are accessed through a Node.js backend. The Meta API key stays on the server and is never placed in the frontend.

## How the Application Works

The application has two main parts:

**Frontend**

- React and TypeScript
- Vite
- Tailwind CSS
- Hosted on Vercel

**Backend**

- Node.js
- WebSocket connection for live transcription
- HTTP endpoints for Catch Me Up and Study Notes
- Hosted on Render

The frontend connects to the backend over HTTPS and secure WebSockets in production.

Saved sessions are stored locally in the browser using IndexedDB. The application does not currently provide cloud accounts or cross-device synchronization.

## Running ClassBridge AI Locally

### Requirements

- Node.js 24.10 or later, or 22.21 or later
- npm
- A Meta Model API key
- A browser with microphone access

### 1. Clone the repository

```bash
git clone https://github.com/Terence-Sseremba/ClassBridge-AI.git
cd ClassBridge-AI
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure the backend

Copy `.env.example` to a new `.env` file at the project root. Set your Meta API key:

```dotenv
MODEL_API_KEY=your_meta_api_key_here
```

Keep this file private. Never commit your actual API key to GitHub. An existing `MODEL_API_KEY` in the backend's environment takes precedence over the value in `.env`.

### 4. Start the backend

```bash
npm run dev:server
```

### 5. Start the frontend

Open another terminal and run:

```bash
npm run dev
```

Then visit http://localhost:5173 and allow microphone access when you start a class.

On Windows PowerShell, use `npm.cmd` instead of `npm` if script execution is blocked.

### 6. Run the project checks

```bash
npm run build
npm run lint
npm run format:check
```

## Deployment

The live application uses Vercel for the frontend and Render for the backend.

The frontend needs this environment variable:

```dotenv
VITE_API_BASE_URL=https://your-backend-host
```

The backend needs:

```dotenv
NODE_ENV=production
MODEL_API_KEY=your_meta_api_key_here
CLASSBRIDGE_ALLOWED_ORIGIN=https://your-frontend-host
```

The backend uses the `PORT` supplied by its hosting provider and exposes a `/health` endpoint. Keep the API key on the backend.

## Current Limitations

ClassBridge AI is an early working version, and there are still areas I want to improve.

- Live captions depend on the microphone, internet connection, and Meta's transcription service.
- The hosted backend may take time to wake up after being inactive.
- Saved sessions belong to the browser where they were created. Clearing browser data can remove them.
- Study Notes need enough completed captions. For longer sessions, they use at most the latest 80 completed captions within 12,000 characters.
- The application does not identify individual speakers.
- The public backend needs stronger protection against misuse before wider use.

## What Comes Next

I would like to improve the reliability of live transcription, especially when internet connections are unstable. I also want to explore better ways of supporting longer classes, improving the learning experience on mobile devices, and helping students access their saved work across devices.

For now, the focus is on building from what already works, testing it with real users, and understanding what students actually need.

## Why I Built This

As a student developer from Uganda, I wanted to work on something that could make a difference in education. ClassBridge AI is my attempt to use the AI tools available today to address a real classroom challenge.

There's still a lot to learn and improve, but I'm glad I was able to take this idea from an early prototype to a deployed application.

Built for the **Meta Global AI Developer Hackathon 2026**.

## Project Links

- **Live application:** https://class-bridge-ai.vercel.app
- **GitHub:** https://github.com/Terence-Sseremba/ClassBridge-AI
