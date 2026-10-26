# AI Study Assistant

A small React + Express application using MongoDB, bcrypt, JWT, and local Ollama.
Learners ask general study questions and request practice questions. Administrators
can also save private notes and use their own notes as retrieval context.

## Prerequisites

- Node.js 22.12+ and npm
- MongoDB running locally or a MongoDB connection URI
- [Ollama](https://ollama.com/) running locally

Download the generation and embedding models before starting:

```sh
ollama pull llama3.2
ollama pull nomic-embed-text
```

Start Ollama with `ollama serve` if it is not already running.
The generation model can require several GB of RAM and the first answer may be slow.

## Setup

From the repository root:

```sh
npm ci --prefix backend
npm ci --prefix frontend
cp backend/.env.example backend/.env
```

Edit `backend/.env` locally. Generate a random JWT secret with
`node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`
and paste the result into `JWT_SECRET`. Never commit `.env` or real credentials.

| Variable | Purpose / default |
| --- | --- |
| `PORT` | Backend port, `3001` |
| `MONGODB_URI` | MongoDB URI, `mongodb://127.0.0.1:27017/study_assistant` |
| `JWT_SECRET` | Required random secret, at least 32 characters; no default |
| `OLLAMA_URL` | Trusted local AI server, `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Generation model, `llama3.2` |
| `OLLAMA_EMBED_MODEL` | Embedding model, `nomic-embed-text` |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Used only by the admin provisioning command |
| `NODE_ENV` | Set to `production` to serve the built frontend from Express |

Keep Ollama and MongoDB private. Notes and questions are sent to the configured
Ollama server, so only configure a server you trust. Changing the embedding model
requires recreating notes so their stored embeddings match the new model.

Start the API in one terminal:

```sh
cd backend
npm run dev
```

Start React in a second terminal, from the repository root:

```sh
cd frontend
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to port `3001`, keeping requests
same-origin. If you change `PORT`, update the proxy in `frontend/vite.config.js`.
Environment files are loaded from the backend working directory.

### Provision an administrator

Public registration **only creates learners**; clients cannot choose their role.
To create a separate admin account, temporarily set `ADMIN_NAME`, `ADMIN_EMAIL`,
and `ADMIN_PASSWORD` in `backend/.env`, then run:

```sh
cd backend
npm run create-admin
```

Remove the `ADMIN_*` values afterward. Existing accounts are not promoted or
overwritten by this command. Use a unique email for each admin. Passwords require
at least 12 characters and no more than 72 UTF-8 bytes (bcrypt's limit).

### Production

```sh
npm run build --prefix frontend
cd backend
NODE_ENV=production npm start
```

Open `http://localhost:3001`. Express serves both `/api` and the React pages,
including direct page navigation. Use HTTPS at a reverse proxy before deploying
publicly; JWTs are bearer credentials. Sessions expire after two hours, are stored
per browser tab in session storage, and are cleared by Logout. The API checks the
current database role on every protected request. Rate limiting is in-memory for
this single-process demo; a multi-instance deployment needs a shared limiter.

## API

All paths below also work with the `/api` prefix (used by the frontend).
POST bodies are JSON. Protected endpoints require
an `Authorization` header containing the `Bearer` scheme followed by a space
and the token returned by login or registration.
Errors return `{ "error": "message" }` with an appropriate HTTP status.

| Method | Path | Access / body |
| --- | --- | --- |
| POST | `/auth/register` | Public; `{ name, email, password }` creates a learner and returns `{ token, user }` |
| POST | `/auth/login` | Public; `{ email, password }` returns `{ token, user }` |
| GET | `/auth/me` | Logged in; returns `{ user }` |
| GET | `/notes` | Admin; returns `{ notes }`, scoped to the caller |
| POST | `/notes` | Admin; `{ title, subject, content }` saves and indexes an owned note |
| POST | `/study/ask` | Logged in; `{ question, includePractice?: boolean }` returns `{ answer, sources, practice? }` |
| POST | `/study/quiz` | Logged in; `{ topic, questionCount?: number }` returns `{ quiz, sources }` |

The UI offers a checkbox to request three practice questions alongside an answer.
The optional quiz endpoint also generates practice questions.

### Privacy and retrieval

- Notes store the authenticated creator ID, never an owner supplied by a client.
- Only admins can list/create notes, and listing filters by that creator ID.
- Notes are split into overlapping chunks and embedded using Ollama.
- Admin retrieval first selects that admin's notes, then selects only chunks
  belonging to those notes, ranks by cosine similarity, and sends the top chunks
  to Ollama. Source titles are shown with the answer.
- Learners skip private-note retrieval and query embeddings entirely.
- A note is available only after indexing succeeds. Ollama failures produce
  visible errors rather than a fake answer or a successfully saved unindexed note.
- This is a small-demo implementation with bounded note/retrieval queries, not a
  large vector database. AI output is untrusted text, not rendered HTML.

## Short walkthrough

1. **Logged out:** open `/study`, `/my-notes`, or `/add-note`. You land on Login;
   navigation and Logout are hidden. Register a learner with name, email, password.
2. **Learner:** only AI Study and Logout appear. Ask “What is photosynthesis?”
   and check “Include three short practice questions.” Read the answer and practice
   questions. A direct visit to `/add-note` redirects to AI Study; API note requests
   return `403`.
3. **Admin A:** log out, then sign in with a provisioned admin. My Notes and Add Note
   now appear. Save a note titled “Photosynthesis Basics,” subject “Biology,” with
   content describing sunlight, chlorophyll, carbon dioxide, water, and glucose.
   My Notes displays it. Ask about photosynthesis and see your note in the sources.
4. **Admin B:** provision and sign in with a second admin. My Notes is empty.
   Asking the same question cannot retrieve Admin A's chunks. Add a different
   note and confirm each account sees only its own notes.
5. **Session boundary:** log out and revisit a protected page. Login is required.
   Missing, expired, and invalid API tokens return `401`.
6. **Service errors:** stop Ollama and ask a question or save a note. The UI reports
   the failure. Restart Ollama and retry.

## Validation

```sh
npm test --prefix backend
npm run lint --prefix frontend
npm run build --prefix frontend
npm audit --prefix backend
npm audit --prefix frontend
```

Backend tests use Node's built-in test runner with isolated model/Ollama doubles
and real HTTP/JWT/bcrypt paths. They do not require MongoDB or model downloads.
For a live end-to-end check, start MongoDB and Ollama and follow the walkthrough;
mocked tests do not establish model answer quality or live database availability.
