import { parseFile } from '@/lib/parsers/index'
import {
  categorizeWithPersonalFallback,
  mergeRules,
  INTERNAL_TRANSFER_RULE_IDS,
  type CategoryOverrides,
  type CategoryRule,
} from '@/lib/categories'
import type { Transaction } from '@/types/transaction'
import type { LoadingState, LoadedFileEntry } from '@/types/loader'
import type { PersonalAccount } from '@/types/personalAccount'
import type { SavingsAccount } from '@/types/savingsAccount'

type ProgressCallback = (state: LoadingState) => void
type FileLoadedCallback = (entry: LoadedFileEntry) => void

export interface LoaderInputs {
  rules: CategoryRule[]
  overrides: CategoryOverrides
  personalAccounts: PersonalAccount[]
  savingsAccounts: SavingsAccount[]
}

/**
 * Load all CSV transaction files and parse them into `Transaction[]`.
 *
 * Strategy is selected automatically:
 *  - **Dev**  (`import.meta.env.DEV`): discovers files via `import.meta.glob`,
 *    fetches each URL from the Vite dev server as an ArrayBuffer, and decodes
 *    with `TextDecoder('windows-1252')` for correct Dutch special characters.
 *  - **Prod** (Docker / Express): fetches the file list from `GET /api/transactions`,
 *    then streams each file via `GET /api/transactions/:filename` with the same
 *    ArrayBuffer + TextDecoder pipeline.
 *
 * Both strategies produce identical `Transaction[]` output via the adapter registry.
 *
 * @param inputs       - Preloaded categorization inputs (rules, overrides,
 *                       account lists) supplied by caller.
 * @param onProgress   - Called after each file is processed; useful for updating a
 *                       loading screen with live progress.
 * @param onFileLoaded - Called once per successfully parsed file with metadata
 *                       (filename, row count, bank id, timestamp).
 */
export async function loadAllTransactions(
  inputs: LoaderInputs,
  onProgress?: ProgressCallback,
  onFileLoaded?: FileLoadedCallback,
): Promise<Transaction[]> {
  return import.meta.env.DEV
    ? loadFromVite(inputs, onProgress, onFileLoaded)
    : loadFromApi(inputs, onProgress, onFileLoaded)
}

// ─── Dev strategy: Vite dev server ──────────────────────────────────────────

async function loadFromVite(
  inputs: LoaderInputs,
  onProgress?: ProgressCallback,
  onFileLoaded?: FileLoadedCallback,
): Promise<Transaction[]> {
  // import.meta.glob resolves the matched paths at build time.
  // We only need the keys (import paths); no module body is imported,
  // so `eager: false` (default) is used and we discard the loader functions.
  // The import path is also a valid fetch URL: Vite dev server serves
  // project-root files at their path when `server.fs.allow: ['.']`.
  const importPaths = Object.keys(
    import.meta.glob('/data/transactions/*.csv'),
  )

  return processFiles(
    importPaths.map((importPath) => ({
      filename: importPath.split('/').pop() ?? importPath,
      url: importPath,
    })),
    inputs,
    onProgress,
    onFileLoaded,
  )
}

// ─── Prod strategy: Express API ──────────────────────────────────────────────

async function loadFromApi(
  inputs: LoaderInputs,
  onProgress?: ProgressCallback,
  onFileLoaded?: FileLoadedCallback,
): Promise<Transaction[]> {
  const filenames: string[] = await fetch('/api/transactions').then((r) => {
    if (!r.ok) throw new Error(`/api/transactions responded ${r.status}`)
    return r.json() as Promise<string[]>
  })

  return processFiles(
    filenames.map((filename) => ({
      filename,
      url: `/api/transactions/${encodeURIComponent(filename)}`,
    })),
    inputs,
    onProgress,
    onFileLoaded,
  )
}

// ─── Shared processing ───────────────────────────────────────────────────────

interface FileEntry {
  filename: string
  url: string
}

async function processFiles(
  files: FileEntry[],
  inputs: LoaderInputs,
  onProgress?: ProgressCallback,
  onFileLoaded?: FileLoadedCallback,
): Promise<Transaction[]> {
  const fileCount = files.length
  const all: Transaction[] = []
  const errors: string[] = []
  let loadedFiles = 0
  let rowCount = 0

  for (const { filename, url } of files) {
    onProgress?.({
      status: 'loading',
      fileCount,
      loadedFiles,
      rowCount,
      currentFile: filename,
      errors: [...errors],
    })

    try {
      const buffer = await fetch(url).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.arrayBuffer()
      })

      // Rabobank exports are Windows-1252 encoded. TextDecoder handles this
      // correctly, preserving Dutch special characters (ë, é, ü, etc.).
      const content = new TextDecoder('windows-1252').decode(buffer)
      const txns = parseFile(filename, content)

      all.push(...txns)
      rowCount += txns.length

      onFileLoaded?.({
        filename,
        rowCount: txns.length,
        bankId: txns[0]?.bankId ?? 'unknown',
        loadedAt: new Date(),
      })
    } catch (err) {
      const msg = `${filename}: ${err instanceof Error ? err.message : String(err)}`
      errors.push(msg)
      console.warn('[csvLoader]', msg)
    }

    loadedFiles++
  }

  onProgress?.({
    status: errors.length > 0 ? 'error' : 'success',
    fileCount,
    loadedFiles,
    rowCount,
    currentFile: null,
    errors,
  })

  // ── Post-processing: categorization + manual overrides ───────────────────
  // Done once after all files are parsed so that rule evaluation has access
  // to the full transaction set (relevant for future cross-transaction rules).

  // ── Step 1: Build categorization inputs ──────────────────────────────────
  const customRules = inputs.rules
  // Exclude the tb-based internal-transfer fallback rules — transfers are only
  // recognised when the counterparty IBAN is explicitly added to Personal Accounts.
  const rules = mergeRules(customRules).filter((r) => !INTERNAL_TRANSFER_RULE_IDS.has(r.id))
  const overrides = inputs.overrides
  const personalAccounts = inputs.personalAccounts

  return all.map((tx) => {
    // Manual category override wins over all auto-classification
    const manualOverride = overrides[tx.id]
    if (manualOverride !== undefined) {
      return manualOverride === tx.category ? tx : { ...tx, category: manualOverride }
    }

    // Rule engine first; personal-account fallback only when uncategorized.
    const category = categorizeWithPersonalFallback(tx, rules, personalAccounts)
    return category === tx.category ? tx : { ...tx, category }
  })
}
