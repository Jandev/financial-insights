# Financial Insights

A personal finance dashboard for analyzing Rabobank transaction data. Visualizes spending patterns, income vs. expenses, and category breakdowns across monthly CSV exports. Includes an AI Advisor powered by Azure OpenAI / LangChain.

## What it does

- Parses Dutch Rabobank CSV exports (`CSV_A_*.csv`)
- Dashboard with KPI cards: balance, income, expenses, net savings
- Monthly overview with income/expense breakdown, category donuts, and month-over-month deltas
- Transaction table with filtering, sorting, and category overrides
- Insights page — top merchants, biggest transactions, monthly spend trend, income vs savings rate
- Named savings goals (Spaarpotjes) — track deposits/withdrawals per named pot
- Internal transfer detection — own-account transfers excluded from income/expense automatically
- Category breakdown with custom rules and tag support
- State persistence across sessions via server-side JSON store
- **AI Categorization** — LLM assigns/corrects categories in bulk
- **Anomaly Detection** — statistical + LLM-explained unusual transactions
- **AI Monthly Insights** — streaming narrative summaries per month
- **AI Advisor chat** — conversational financial advisor with 6 tools

Place your own Rabobank CSV exports in `data/transactions/`.

---

## AI Features

All AI features require an Azure OpenAI (or OpenAI-compatible) endpoint and the full-stack dev server.

### Setup

1. Copy `.env.example` to `.env` and fill in the Azure OpenAI credentials:

```bash
cp .env.example .env
```

Required variables:

| Variable | Example | Description |
|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | `https://sp-coding.cognitiveservices.azure.com/` | Azure OpenAI resource endpoint |
| `AZURE_OPENAI_API_KEY` | `sk-...` | API key from Azure Portal |
| `AZURE_OPENAI_DEPLOYMENT` | `gpt-4o-mini` | Deployment name |
| `AZURE_OPENAI_API_VERSION` | `2025-01-01-preview` | **Must be `2025-01-01-preview`** for LangGraph tool-calling |

> **Note:** Use the `cognitiveservices.azure.com` endpoint (Foundry format), not the older `openai.azure.com` format.

2. Start the full-stack server (Vite + Express together):

```bash
npm run dev:full
```

Vite runs on `http://localhost:5173`, Express on `http://localhost:3000`. Vite proxies all `/api/*` requests to Express automatically.

### AI feature locations

| Feature | Where |
|---|---|
| AI Categorize | Categories page → "AI Categorize" button in header |
| Anomaly Alerts | Insights page |
| Monthly AI Insight | Monthly Overview page → streaming card below category charts |
| AI Advisor (full page) | `/ai-advisor` route |
| AI Advisor (chat panel) | Floating button bottom-right on all pages |

### Optional: LangSmith tracing

```env
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=ls__...
LANGSMITH_PROJECT=financial-insights
```

---

## Quick Start — Docker

Requires Docker with Compose v2 (`docker compose`).

```bash
# 1. Copy env template and edit as needed
cp .env.example .env

# 2. Place your Rabobank CSV exports in data/transactions/
#    (files are never baked into the image — mounted as a read-only volume)

# 3. Build and start
docker compose up --build -d

# 4. Open http://localhost:3000
```

Stop:

```bash
docker compose down
```

Or use `make`:

```bash
make up      # build + start in background
make down    # stop
make logs    # tail logs
make build   # docker build only
```

### Volume mounts

| Host path | Container path | Mode | Purpose |
|---|---|---|---|
| `./data/transactions` | `/app/data/transactions` | read-only | Rabobank CSV exports |
| `./data/state` | `/app/data/state` | read-write | Persisted state (categories, rules, anomalies, insights) |

The image contains no CSV data. State survives container restarts via the `data/state` volume.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the Express server listens on |
| `NODE_ENV` | `production` | Node environment |
| `TRANSACTIONS_PATH` | `/app/data/transactions` | Path to CSV files inside container |
| `STATE_PATH` | `/app/data/state` | Path to state JSON files inside container |
| `APP_TITLE` | `Financial Insights` | Page title |
| `BASIC_AUTH_USER` | _(empty)_ | HTTP Basic Auth username — leave blank to disable |
| `BASIC_AUTH_PASS` | _(empty)_ | HTTP Basic Auth password — leave blank to disable |
| `AZURE_OPENAI_ENDPOINT` | _(empty)_ | Azure OpenAI endpoint (`cognitiveservices.azure.com` format) |
| `AZURE_OPENAI_API_KEY` | _(empty)_ | Azure OpenAI key |
| `AZURE_OPENAI_DEPLOYMENT` | `gpt-4o-mini` | Azure OpenAI deployment name |
| `AZURE_OPENAI_API_VERSION` | `2025-01-01-preview` | Must be `2025-01-01-preview` for tool-calling |
| `OPENAI_API_KEY` | _(empty)_ | OpenAI direct key (fallback when Azure vars absent) |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible base URL |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model name for direct OpenAI |
| `LLM_TEMPERATURE` | `0.3` | LLM sampling temperature |
| `LLM_MAX_TOKENS` | `1024` | Max tokens per LLM response |
| `LANGSMITH_TRACING` | `false` | Enable LangSmith tracing |
| `LANGSMITH_API_KEY` | _(empty)_ | LangSmith API key |
| `LANGSMITH_PROJECT` | `financial-insights` | LangSmith project name |

See `.env.example` for the full documented template.

---

## Hosting on a NAS (GHCR)

Pre-build the image locally, push it to GitHub Container Registry, and pull it on the NAS. No source code or build tools required on the NAS.

### 1. Create GitHub Personal Access Tokens

Go to **GitHub → Settings → Developer settings → Personal access tokens**.

| Token | Scope | Used for |
|---|---|---|
| Local (push) | `write:packages` | Pushing the image from your machine |
| NAS (pull) | `read:packages` | Pulling the image on the NAS |

Use separate tokens so the NAS token is minimal-privilege.

### 2. Build and push the image (local machine)

```bash
# Log in to GHCR
docker login ghcr.io -u YOUR_GITHUB_USERNAME -p YOUR_PUSH_PAT

# Build and tag
docker build -t ghcr.io/YOUR_GITHUB_USERNAME/financial-insights:latest .

# Push
docker push ghcr.io/YOUR_GITHUB_USERNAME/financial-insights:latest
```

Repeat the build + push whenever you want to deploy a new version.

### 3. Authenticate on the NAS (one-time)

SSH into the NAS and run:

```bash
docker login ghcr.io -u YOUR_GITHUB_USERNAME -p YOUR_PULL_PAT
```

Credentials are stored in `~/.docker/config.json` and reused automatically.

### 4. docker-compose.yml on the NAS

Replace the local `build:` reference with the registry image:

```yaml
services:
  financial-insights:
    image: ghcr.io/YOUR_GITHUB_USERNAME/financial-insights:latest
    ports:
      - "${PORT:-3000}:3000"
    volumes:
      - ./data/transactions:/app/data/transactions:ro
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      start_period: 10s
      retries: 3
```

### 5. Deploy on the NAS

```bash
# Pull latest image and start
docker compose pull
docker compose up -d
```

To update to a newer image after pushing from your local machine:

```bash
docker compose pull && docker compose up -d
```

---

## Quick Start — Local Dev

Requires Node.js 22+ and npm 10+.

```bash
npm install

# UI only (no AI features)
npm run dev        # http://localhost:5173

# Full stack (UI + AI features)
npm run dev:full   # Vite on :5173, Express on :3000
```

Other scripts:

```bash
npm run build      # production build → dist/
npm run preview    # preview production build locally
npm run lint       # ESLint
```

## Tech stack

| Layer | Library |
|---|---|
| Runtime | Node.js 22 + Express 4 |
| Build | Vite 8 |
| UI | React 18 + TypeScript |
| Routing | React Router 6 |
| State | Zustand 5 |
| Styling | Tailwind CSS 4 |
| UI primitives | Radix UI |
| Charts | Recharts 3 |
| Table | TanStack Table 8 |
| CSV parsing | PapaParse |
| Icons | Lucide React |
| Utilities | clsx, tailwind-merge, date-fns |
| AI | LangChain + LangGraph + Azure OpenAI |

## Project structure

```
financial-insights/
├── data/transactions/     # Rabobank CSV exports (gitignored, volume-mounted in Docker)
├── server/
│   ├── index.ts           # Express server (static + API)
│   ├── routes/            # llm, categorize, analyze, insights, chat
│   ├── services/          # llm, advisor, transactionStore, insightBuilder, anomalyDetector
│   ├── middleware/        # basicAuth, rateLimiter
│   └── lib/               # sse helper
├── design/                # Penpot source file + screen mockups
├── src/
│   ├── components/
│   │   ├── ai/            # ChatInterface, ChatSlideIn, AICategorizeButton, AnomalyAlerts, AIInsightCard, LLMGate
│   │   ├── ui/            # Base components (Card, Badge, Button)
│   │   └── layout/        # Shell components (Layout, Sidebar, WindowChrome)
│   ├── pages/             # Route-level page components
│   ├── lib/               # Utilities (CSV parsing, formatters, uuid, etc.)
│   ├── hooks/             # useStateHydration, useTransactionSync, useCategoryRules
│   ├── store/             # Zustand store (slices: transactions, ui, llm)
│   └── types/             # Shared TypeScript types
├── .env.example           # Environment variable template
├── docker-compose.yml
├── Dockerfile
├── Makefile
└── vite.config.ts
```
