# Spaarpotjes (Savings Goals)

Spaarpotjes are named savings goals backed by real counterparty IBANs. Transfers to/from a registered IBAN are automatically categorized and tracked separately from regular income and expenses.

## Setup

Go to **Settings → Spaarpotjes** and add a pot:

- **Name** — display label (e.g. "Vakantie", "Buffer")
- **IBAN** — the counterparty IBAN of the savings account
- **Color** — auto-assigned from a palette, can be changed

Each registered IBAN is matched case-insensitively against transaction counterparty IBANs.

## How matching works

`matchSpaarpotje()` runs during `recategorize()` with the **highest priority** — it overrides all other rules including manual overrides.

| Transaction direction | Category assigned | Meaning |
|---|---|---|
| Outbound (amount < 0) | `spaarpotje` | Deposit into savings pot |
| Inbound (amount > 0) | `spaarpotje-withdrawal` | Withdrawal from savings pot |

The pot's name is stored as a tag on the transaction (`tx.tags[0]`), enabling per-pot balance tracking.

## Effect on totals

Both `spaarpotje` and `spaarpotje-withdrawal` are in the `SPAARPOTJE_CATEGORIES` set. Transactions in these categories are **excluded from income and expense totals** on all pages. They are also excluded from the AI Advisor's financial summaries.

This prevents savings deposits from inflating expenses and withdrawals from inflating income.

## Dashboard widget

The **Spaarpotjes widget** on the Dashboard shows one card per pot with:

- Current net balance (deposits minus withdrawals)
- Number of deposits (stortingen)
- Number of withdrawals (opnames)

Balances are computed by `useSpaarpotjeBalances()` — a Zustand selector that sums all tagged transactions per pot from the loaded CSV data.

> Note: balances reflect only what is present in loaded CSV exports. If older files are not loaded, historical transactions are not included.

## Personal Accounts vs Spaarpotjes

These are different concepts:

| | Spaarpotjes | Personal Accounts |
|---|---|---|
| Purpose | Named savings goals | Own payment/savings accounts |
| Category | `spaarpotje` / `spaarpotje-withdrawal` | `internal-transfer` |
| Included in totals | No — excluded | Yes — included |
| Auto-detected | No — manual registration | No — manual registration |

Register your own IBANs (joint account, secondary account, etc.) under **Settings → Personal Accounts** to mark those transfers as internal rather than income/expense.

## Persistence

Spaarpotje definitions are stored in `data/state/spaarpotjes.json` via a debounced PUT to `/api/state/spaarpotjes`. Every add/edit/delete triggers `recategorize()` so the transaction list updates immediately.
