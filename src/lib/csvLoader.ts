import { parseFile } from '@/lib/parsers/index'
import type { Transaction } from '@/types/transaction'
import type { LoadingState, LoadedFileEntry } from '@/types/loader'

type ProgressCallback = (state: LoadingState) => void
type FileLoadedCallback = (entry: LoadedFileEntry) => void

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
 * @param onProgress   - Called after each file is processed; useful for updating a
 *                       loading screen with live progress.
 * @param onFileLoaded - Called once per successfully parsed file with metadata
 *                       (filename, row count, bank id, timestamp).
 */
export async function loadAllTransactions(
  onProgress?: ProgressCallback,
  onFileLoaded?: FileLoadedCallback,
): Promise<Transaction[]> {
  return import.meta.env.DEV
    ? loadFromVite(onProgress, onFileLoaded)
    : loadFromApi(onProgress, onFileLoaded)
}

// ─── Dev strategy: Vite dev server ──────────────────────────────────────────

async function loadFromVite(onProgress?: ProgressCallback, onFileLoaded?: FileLoadedCallback): Promise<Transaction[]> {
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
    onProgress,
    onFileLoaded,
  )
}

// ─── Prod strategy: Express API ──────────────────────────────────────────────

async function loadFromApi(onProgress?: ProgressCallback, onFileLoaded?: FileLoadedCallback): Promise<Transaction[]> {
  const filenames: string[] = await fetch('/api/transactions').then((r) => {
    if (!r.ok) throw new Error(`/api/transactions responded ${r.status}`)
    return r.json() as Promise<string[]>
  })

  return processFiles(
    filenames.map((filename) => ({
      filename,
      url: `/api/transactions/${encodeURIComponent(filename)}`,
    })),
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

  return all
}
