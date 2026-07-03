/** Metadata recorded for each successfully parsed CSV file. */
export interface LoadedFileEntry {
  filename: string
  /** Number of transaction rows parsed from this file */
  rowCount: number
  /** Adapter that matched this file, e.g. `'rabobank'` */
  bankId: string
  /** Wall-clock time when parsing completed */
  loadedAt: Date
}

export interface LoadingState {
  status: 'idle' | 'loading' | 'success' | 'error'
  /** Total number of CSV files discovered */
  fileCount: number
  /** Number of files fully processed (success or error) */
  loadedFiles: number
  /** Running total of parsed transaction rows */
  rowCount: number
  /** Base filename currently being processed, or null when not actively loading */
  currentFile: string | null
  /** Per-file error messages; non-empty when status is 'error' */
  errors: string[]
}

export const initialLoadingState: LoadingState = {
  status: 'idle',
  fileCount: 0,
  loadedFiles: 0,
  rowCount: 0,
  currentFile: null,
  errors: [],
}
