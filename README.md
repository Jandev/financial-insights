# Financial Insights

A personal finance dashboard for analyzing Rabobank transaction data. Visualizes spending patterns, income vs. expenses, and category breakdowns across monthly CSV exports.

## What it does

- Parses Dutch Rabobank CSV exports (`CSV_A_*.csv`)
- Dashboard with KPI cards: balance, income, expenses, net savings
- Monthly income vs. expenses bar chart
- Transaction table with filtering and sorting
- Category breakdown and top expenses
- AI Advisor (planned)

Data covers account `NL03RABO0150475810`, 25 months (Jun 2024 – Jun 2026). CSV files are gitignored — place your own exports in `data/transactions/`.

## Prerequisites

- Node.js 20+
- npm 10+

## Set up

```bash
npm install
```

## Running

```bash
# Development server (http://localhost:5173)
npm run dev

# Production build → dist/
npm run build

# Preview production build locally
npm run preview
```

## Linting

```bash
npm run lint
```

## Tech stack

| Layer | Library |
|---|---|
| Build | Vite 5 |
| UI | React 18 + TypeScript |
| Routing | React Router 6 |
| State | Zustand 5 |
| Styling | Tailwind CSS 4 |
| Charts | Recharts 3 |
| Table | TanStack Table 8 |
| CSV parsing | PapaParse |
| Icons | Lucide React |
| Utilities | clsx, tailwind-merge, date-fns |

## Project structure

```
financial-insights/
├── data/transactions/     # Rabobank CSV exports (gitignored)
├── design/                # Penpot source file + screen mockups
├── src/
│   ├── components/        # Reusable UI components
│   ├── pages/             # Route-level page components
│   ├── lib/               # Utilities (CSV parsing, formatters, etc.)
│   ├── store/             # Zustand state stores
│   └── types/             # Shared TypeScript types
├── index.html
└── vite.config.ts
```
