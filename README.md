# Financial Insights

A personal finance dashboard for analyzing Rabobank transaction data. Visualizes spending patterns, income vs. expenses, and category breakdowns across monthly CSV exports.

## What it does

- Parses Dutch Rabobank CSV exports (`CSV_A_*.csv`)
- Dashboard with KPI cards: balance, income, expenses, net savings
- Monthly income vs. expenses bar chart
- Transaction table with filtering and sorting
- Category breakdown and top expenses
- AI Advisor (planned)

Data covers account `NL00RABO0000000000`, 25 months (Jun 2024 – Jun 2026). CSV files are gitignored — place your own exports in `data/transactions/`.

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

### Volume mount

`./data/transactions` on the host is mounted read-only at `/app/data/transactions` inside the container. The image contains no CSV data.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the Express server listens on |
| `NODE_ENV` | `production` | Node environment |
| `TRANSACTIONS_PATH` | `/app/data/transactions` | Path to CSV files inside container |
| `APP_TITLE` | `Financial Insights` | Page title |
| `BASIC_AUTH_USER` | _(empty)_ | HTTP Basic Auth username — leave blank to disable |
| `BASIC_AUTH_PASS` | _(empty)_ | HTTP Basic Auth password — leave blank to disable |
| `OPENAI_API_KEY` | _(empty)_ | OpenAI key for future AI features |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible base URL |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model name |
| `AZURE_OPENAI_ENDPOINT` | _(empty)_ | Azure OpenAI endpoint (alternative to OpenAI) |
| `AZURE_OPENAI_API_KEY` | _(empty)_ | Azure OpenAI key |
| `AZURE_OPENAI_DEPLOYMENT` | _(empty)_ | Azure OpenAI deployment name |
| `AZURE_OPENAI_API_VERSION` | `2024-02-01` | Azure OpenAI API version |

See `.env.example` for the full documented template.

---

## Quick Start — Local Dev

Requires Node.js 22+ and npm 10+.

```bash
npm install
npm run dev        # http://localhost:5173  (Vite, hot-reload)
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

## Project structure

```
financial-insights/
├── data/transactions/     # Rabobank CSV exports (gitignored, volume-mounted in Docker)
├── server/
│   ├── index.js           # Express server (static + API)
│   └── middleware/
│       └── basicAuth.js   # HTTP Basic Auth (issue #14)
├── design/                # Penpot source file + screen mockups
├── src/
│   ├── components/
│   │   ├── ui/            # Base components (Card, Badge, Button)
│   │   └── layout/        # Shell components (Layout, Sidebar, WindowChrome)
│   ├── pages/             # Route-level page components
│   ├── lib/               # Utilities (CSV parsing, formatters, etc.)
│   ├── store/             # Zustand state stores
│   └── types/             # Shared TypeScript types
├── .env.example           # Environment variable template
├── docker-compose.yml
├── Dockerfile
├── Makefile
└── vite.config.ts
```
