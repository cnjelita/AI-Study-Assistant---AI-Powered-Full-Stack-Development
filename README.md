# AI Study Assistant — Kitchen Assistant adaptation

A small React + Express + MongoDB + Ollama app with learner registration, JWT login, administrator-owned notes, embeddings, and private RAG. Reuses the uploaded Kitchen Assistant's `db.js`, `llm.js`, `rag.js`, `server.js` patterns and Vite React frontend architecture, adapted to study notes and authorization.

## Windows prerequisites

Install Node.js 20.19+ (22 LTS recommended), MongoDB Community Server (running locally), and Ollama. Use PowerShell or VS Code; **do not use `nano`**. Ensure `node`, `npm`, and `ollama` are on PATH.

Open PowerShell:

```powershell
ollama pull llama3.2
ollama pull nomic-embed-text
ollama serve
```

If Ollama is already running as a Windows service/app, do not launch a second server.

In another terminal:

```powershell
cd backend
Copy-Item .env.example .env
notepad .env
npm install
npm start
```

Edit `JWT_SECRET` to a random secret of 32+ characters. Set `MONGO_URI` for your local MongoDB. Keep secrets out of source control.

In a third terminal:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open http://localhost:5173. API: http://localhost:3000/health.

## Create an administrator

All public registrations are **learners** (prevents privilege escalation). Register an account in the UI, then run from `backend` in a trusted local terminal:

```powershell
node --env-file=.env promote-admin.js admin@example.com
```

Log out and log back in to receive the updated role. Do not expose this script as a public API.

## Environment variables

Backend: `MONGO_URI`, `JWT_SECRET`, `OLLAMA_URL`, `CHAT_MODEL`, `EMBED_MODEL`, `PORT`, `FRONTEND_ORIGIN`.
Frontend: `VITE_API_URL`. Example values are in each `.env.example`; no real credentials are included.

## API

- `POST /auth/register` — `{name,email,password}` (creates learner only)
- `POST /auth/login` — `{email,password}` returns `{token,user}`
- `GET /auth/me` — current account (Bearer token)
- `GET /notes` — admin's own notes only
- `POST /notes` — admin only, `{title,subject,content}`, indexes embeddings
- `POST /study/ask` — `{question}`; JWT required
- `POST /study/quiz` — `{question}`; JWT required, exactly 3 practice questions requested

## Walkthrough / acceptance demonstration

1. Logged out: only Login and Register are displayed; `/study` redirects to Login; API calls without Bearer token return 401.
2. Register `learner@example.com` and sign in. AI Study is available; My Notes and Add Note are absent. Ask **What is photosynthesis?** and use **Generate 3 questions**. The server returns `mode: general` with no private-note sources.
3. Register `adminA@example.com`; promote it from the trusted terminal and log in again. Add a note **Photosynthesis Basics**, subject **Biology**, content **Photosynthesis converts light energy into chemical energy in plants. Chlorophyll absorbs light.** My Notes displays it. Ask about chlorophyll: relevant note chunks are searched for this admin only and returned as cited context when similarity qualifies.
4. Register/promote `adminB@example.com`. Admin B's My Notes is empty; asking about Admin A's note cannot retrieve Admin A's chunks. A learner also cannot retrieve them.
5. Send a learner token to `GET /notes` or `POST /notes`: HTTP 403. Send a missing or invalid token: HTTP 401.
6. Stop Ollama and try asking a question: API reports service failure rather than returning a fabricated answer.

### Private RAG design

Each note is stored with `createdBy` as a MongoDB ObjectId. Each embedded chunk stores `createdBy` and `noteId`. The backend queries `noteChunks` by **authenticated user ID before computing similarity**, then verifies note ownership again while resolving sources. Learners never query note chunks. JWT identity and role are resolved from the database on every protected request. The browser's role-based navigation is only a convenience; server-side authorization is mandatory.

### Design limitations

This is a local educational demo, not a production hardened identity platform. Tokens live in sessionStorage; production systems should evaluate secure HttpOnly cookie sessions, CSRF controls, rate limiting, auditing, HTTPS, and stricter prompt-injection defenses. The RAG index uses straightforward in-memory cosine ranking over only the owner's chunks, suitable for small note collections. The model may not always comply with exactly three questions. No screenshots are claimed; the walkthrough above is reproducible when services are running.

## Tests

```powershell
cd backend
npm test
```

Run `npm run build` inside `frontend` to check the frontend build. End-to-end acceptance requires running MongoDB and Ollama locally.
