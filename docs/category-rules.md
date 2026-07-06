# Category Rules

Categories determine how transactions appear in charts, totals, and AI insights. The engine is two-tier: custom rules run first, built-in defaults run after.

## Priority order

Each transaction is categorized by `recategorize()` using this waterfall — first match wins:

1. **Spaarpotje IBAN match** — if the counterparty IBAN is a registered savings goal, category is `spaarpotje` (outbound) or `spaarpotje-withdrawal` (inbound). See [spaarpotjes.md](spaarpotjes.md).
2. **Manual override** — category set by the user directly on a transaction row (persisted to `data/state/categories.json`).
3. **Personal account IBAN match** — if the counterparty IBAN is a registered own account, category is `internal-transfer`.
4. **Custom rules** — condition-based rules created in the Rule Editor (prepended, run in order).
5. **Default rules** — built-in pattern-based rules (run in order, first match wins).
6. **`uncategorized`** — fallback if nothing matches.

## Built-in default rules

Defined in `src/lib/categories.ts`. Matched by substring patterns, transaction codes, credit/debit direction, or minimum amount.

| Category | Examples matched |
|---|---|
| `income` | Salary, wages — credit transactions matching income patterns |
| `groceries` | Albert Heijn, Jumbo, Lidl, Aldi, Plus, Coop |
| `dining` | Restaurants, cafes, Thuisbezorgd, Uber Eats |
| `transport` | NS, OV-chipkaart, Arriva, GVB, RET, parking |
| `utilities` | Vattenfall, Eneco, Nuon, Ziggo, KPN, water |
| `healthcare` | Menzis, CZ, Zilveren Kruis, pharmacies |
| `subscriptions` | Netflix, Spotify, Adobe, recurring small debits |
| `rent` | High-value recurring debits to housing counterparties |
| `spaarpotje` | Outbound transfers to registered savings IBANs |
| `spaarpotje-withdrawal` | Inbound transfers from registered savings IBANs |
| `internal-transfer` | `tb` transaction codes (own-bank transfers) |
| `own-account-transfer` | Transfers between registered personal accounts |
| `uncategorized` | Catch-all fallback |

## Custom rules

Created and managed on the **Categories page → Rule Editor**.

### Structure

Each rule has:
- A **name** (display label)
- A **target category** (what to assign)
- One or more **conditions** combined with `and` or `or`

### Condition fields

| Field | Operators | Example |
|---|---|---|
| `description` | `contains`, `equals`, `startsWith` | description contains "Bol.com" |
| `counterpartyIban` | `contains`, `equals`, `startsWith` | counterpartyIban equals "NL12ABNA..." |
| `direction` | `is` (`credit` / `debit`) | direction is debit |
| `amount` | `gte`, `lte` | amount gte 100 |

### Evaluation

- Conditions within a rule are evaluated with the chosen `combinator` (`and`/`or`).
- Rules are evaluated in list order — move rules up/down in the editor to change priority.
- Custom rules always run before default rules.

### Legacy migration

Older pattern-based custom rules are automatically migrated to the condition format on load via `migrateCustomRule()`. No user action required.

## AI Categorization

The **AI Categorize** button (Categories page header) sends uncategorized transactions to the LLM in batches of 30.

- Custom rules are merged into the prompt context so the LLM is aware of user-defined categories.
- Results are saved to `data/state/categories.json` as AI-assigned overrides.
- AI assignments have lower priority than manual overrides but higher than the rule engine.
- Progress streams via SSE — a progress bar shows batch completion.
- The AI Advisor's `runCategorization` tool triggers the same pipeline programmatically.

## Renaming built-in default categories

Built-in default rule names (e.g. `Groceries`, `Transport`) can be renamed without creating a custom rule. On the **Categories page → Rule Editor → Built-in defaults** section, hover any row to reveal a pencil icon. Click it to edit the name inline; press Enter or click away to confirm, or Escape to cancel.

When a name has been overridden, a **RotateCcw** (reset) icon also appears on hover. Click it to restore the English original for that category. The override for that single category is removed; other renames are unaffected.

Renamed categories immediately appear in all charts, filters, and badges — display names are resolved through the active rule set, which applies overrides before rendering.

The original English names in `DEFAULT_RULES` are never changed. Two categories sharing the same display name (e.g. a custom rule also called `Boodschappen`) coexist without conflict — their `id` values are different.

## Persistence

| Store | Location | Mechanism |
|---|---|---|
| Manual + AI category overrides | `data/state/categories.json` | Debounced PUT to `/api/state/categories` |
| Custom rules | `data/state/rules.json` | Debounced PUT to `/api/state/rules` |
| Tag overrides | `data/state/tag-overrides.json` | Debounced PUT to `/api/state/tag-overrides` |
| Default name overrides | `data/state/default-name-overrides.json` | Debounced PUT to `/api/state/default-name-overrides` |

State is hydrated from the server into Zustand on mount via `useStateHydration`. Changes in the browser are written back with a short debounce.
