# InterviewOS

An AI-powered interview preparation platform. Upload your resume, analyze your GitHub projects, and practice with a live AI interviewer that asks real follow-up questions and scores your performance.

No accounts. No login. Works instantly in the browser.

---

## Features

- **AI Question Generator** — Generate role-specific interview questions with detailed answers using Groq LLMs
- **Resume Upload** — Upload a PDF resume; the app extracts your name, skills, and projects automatically
- **GitHub Analyzer** — Paste any public repo URL; the app crawls it, builds a local RAG corpus, and summarizes the tech stack
- **Live AI Interview** — Three modes:
  - `technical` — algorithms, system design, architecture
  - `deep_dive` — questions grounded in your actual GitHub repo code via RAG
  - `behavioral` — STAR-format professional experience questions
- **Feedback Scoring** — After an interview, get scores (0–100) for technical depth, communication, and confidence, plus actionable suggestions
- **Session Management** — Save, pin, and annotate question sets for later review
- **Anonymous by default** — Each browser gets a UUID stored in localStorage; all data is scoped to it with no login required

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, Framer Motion |
| Backend | Node.js, Express 5, better-sqlite3 |
| AI | Groq SDK (LLM inference) |
| Embeddings | `@xenova/transformers` — local ONNX, no external API |
| GitHub crawling | `@octokit/rest` |
| PDF parsing | `pdf-parse` v2 |
| File uploads | Multer |
| Deployment | Render (render.yaml included) |

---

## Project Structure

```
InterviewOS/
├── Backend/
│   ├── config/
│   │   └── db.js                  # SQLite connection + all CREATE TABLE migrations
│   ├── controllers/
│   │   ├── aiController.js        # Question generation, concept explanation
│   │   ├── feedbackController.js  # Interview feedback scoring
│   │   ├── githubController.js    # Repo crawl + RAG pipeline
│   │   ├── interviewController.js # Start/respond/end interview
│   │   ├── questionController.js  # Pin, note, add questions
│   │   ├── resumeController.js    # PDF upload + profile extraction
│   │   └── sessionController.js  # Session CRUD
│   ├── middlewares/
│   │   ├── anonMiddleware.js      # Validates X-Anon-Id header
│   │   ├── rateLimitMiddleware.js # Per-visitor daily AI call cap
│   │   └── uploadMiddlewares.js  # Multer config (PDF only, 10 MB max)
│   ├── models/                    # All SQLite queries (no ORM)
│   ├── routes/                    # Express routers
│   ├── services/
│   │   ├── chunker.js             # Overlapping text chunker for RAG
│   │   ├── embeddingService.js    # Local transformer embeddings + cosine search
│   │   ├── githubCrawler.js       # Octokit crawl + URL parser
│   │   ├── groqClient.js          # Shared Groq SDK client
│   │   ├── pdfParser.js           # pdf-parse v2 wrapper
│   │   └── ragRetrieval.js        # Top-K chunk retrieval for prompts
│   ├── utils/
│   │   └── prompts.js             # All LLM prompt templates
│   ├── .env.example
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── interview/[id]/page.tsx
│   │   │   └── page.tsx           # Landing page
│   │   ├── components/
│   │   │   ├── dashboard/         # ResumeUpload, GithubAnalyze, StartInterviewForm, etc.
│   │   │   ├── interview/         # InterviewRoom (live chat UI)
│   │   │   └── landing/           # Hero, FeatureCards, HowItWorks, etc.
│   │   └── lib/
│   │       ├── anonId.ts          # UUID generation + localStorage persistence
│   │       ├── apiClient.ts       # Fetch wrapper (auto-attaches X-Anon-Id)
│   │       └── types.ts           # Shared TypeScript interfaces
│   ├── .env.local.example
│   └── package.json
├── render.yaml                    # One-click Render deployment config
└── ReadMe.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Groq API key — get one free at [console.groq.com](https://console.groq.com)

### 1. Clone the repo

```bash
git clone https://github.com/sahutushar/Interview0S.git
cd InterviewOS
```

### 2. Set up the backend

```bash
cd Backend
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
PORT=8000
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx   # required
GROQ_MODEL=llama3-70b-8192              # or llama3-8b-8192, mixtral-8x7b-32768
DB_PATH=./interviewos.db
AI_DAILY_LIMIT=20
ALLOWED_ORIGIN=http://localhost:3000
GITHUB_TOKEN=                           # optional, raises GitHub rate limit to 5000/hr
```

```bash
npm install
npm run dev
```

Backend runs on `http://localhost:8000`.

### 3. Set up the frontend

```bash
cd ../frontend
cp .env.local.example .env.local
```

`.env.local` only needs one variable:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

```bash
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

---

## Environment Variables

### Backend (`Backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | Yes | — | Your Groq API key |
| `GROQ_MODEL` | No | `llama3-70b-8192` | Any Groq chat model ID |
| `PORT` | No | `8000` | HTTP port |
| `DB_PATH` | No | `./interviewos.db` | SQLite file path |
| `AI_DAILY_LIMIT` | No | `20` | Max Groq calls per visitor per day |
| `ALLOWED_ORIGIN` | No | `*` | CORS origin (set to your frontend URL in production) |
| `GITHUB_TOKEN` | No | — | GitHub PAT — raises rate limit from 60 to 5000 req/hr |

### Frontend (`frontend/.env.local`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | No | `http://localhost:8000` | Backend base URL |

---

## API Reference

All routes require the `X-Anon-Id: <uuid>` header. Routes marked ⚡ count against the daily AI limit.

### Sessions
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/sessions/create` | Create a session with optional questions |
| `GET` | `/api/sessions/my-sessions` | List all sessions for this visitor |
| `GET` | `/api/sessions/:id` | Get a session with its questions |
| `DELETE` | `/api/sessions/:id` | Delete a session and its questions |

### Questions
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/questions/add` | Add questions to an existing session |
| `POST` | `/api/questions/:id/pin` | Toggle pin on a question |
| `POST` | `/api/questions/:id/note` | Update a question's note |

### AI ⚡
| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/api/ai/generate-questions` | `{ role, experience, topicsToFocus, numberOfQuestions }` | Generate Q&A pairs |
| `POST` | `/api/ai/generate-explanation` | `{ question }` | Deep-dive explanation of a concept |

### Resume ⚡
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/resume/upload` | Upload a PDF (`multipart/form-data`, field name `resume`) |
| `GET` | `/api/resume/profile` | Get the extracted candidate profile |

### GitHub ⚡
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/github/analyze` | `{ repoUrl }` — crawl, embed, and summarize a repo |
| `GET` | `/api/github/projects` | List all analyzed projects |
| `GET` | `/api/github/projects/:id` | Get a single project |

### Interviews ⚡
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/interviews/start` | `{ mode, role, experience?, topicsToFocus?, projectId? }` |
| `GET` | `/api/interviews/` | List all interviews |
| `GET` | `/api/interviews/:id` | Get interview + full transcript |
| `POST` | `/api/interviews/:id/respond` | `{ answer }` — submit answer, get follow-up |
| `POST` | `/api/interviews/:id/end` | Mark interview as completed |
| `POST` | `/api/interviews/:id/feedback` | Generate scored feedback |
| `GET` | `/api/interviews/:id/feedback` | Get existing feedback |

---

## Deployment (Render)

A `render.yaml` is included for one-click deployment.

1. Push the repo to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Connect your repo — Render will detect `render.yaml` automatically
4. Set the secret env vars in the Render dashboard:
   - `GROQ_API_KEY` — your Groq key
   - `ALLOWED_ORIGIN` — your frontend URL (e.g. `https://your-app.vercel.app`)
   - `GITHUB_TOKEN` — optional but recommended
5. Deploy the frontend separately (Vercel recommended for Next.js) and set `NEXT_PUBLIC_API_BASE_URL` to your Render backend URL

The `render.yaml` provisions a 1 GB persistent disk at `/var/data` so the SQLite database survives redeploys.

---

## How the RAG Pipeline Works

1. **Crawl** — Octokit fetches repo metadata, README, up to 25 source files, and the last 10 commits
2. **Chunk** — Each file and the README are split into 800-character overlapping chunks (100-char overlap)
3. **Embed** — All chunks are embedded locally using `all-MiniLM-L6-v2` via `@xenova/transformers` (ONNX, no API call)
4. **Store** — Chunks + embeddings are stored in SQLite as JSON-encoded float arrays
5. **Retrieve** — At interview time, the candidate's answer is embedded and cosine-similarity searched against the corpus; the top-5 chunks are injected into the prompt as context

---

## Supported Groq Models

Any model available at [console.groq.com/docs/models](https://console.groq.com/docs/models) works. Recommended:

| Model | Speed | Context |
|---|---|---|
| `llama3-70b-8192` | Fast | 8K tokens |
| `llama3-8b-8192` | Fastest | 8K tokens |
| `mixtral-8x7b-32768` | Balanced | 32K tokens |
| `llama-3.1-70b-versatile` | Best quality | 128K tokens |

---

## License

MIT

