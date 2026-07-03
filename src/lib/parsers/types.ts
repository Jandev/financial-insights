import type { Transaction } from '@/types/transaction'

/**
 * A bank adapter encapsulates all format knowledge for a single bank's CSV export.
 *
 * To add support for a new bank (e.g. ING):
 *   1. Create `src/lib/parsers/ing.ts` implementing this interface.
 *   2. Import it in `src/lib/parsers/index.ts` and push it onto `registry`.
 *   That's it — the loader requires no changes.
 */
export interface BankAdapter {
  /** Short machine-readable identifier, e.g. `'rabobank'` */
  readonly id: string

  /** Human-readable bank name, e.g. `'Rabobank'` */
  readonly name: string

  /**
   * Return `true` when this adapter should handle the given file.
   * Both the filename and the first decoded line (header row) are provided
   * so detection can use either or both signals.
   *
   * @param filename  - The base filename, e.g. `CSV_A_NL03RABO..._202406.csv`
   * @param firstLine - The first line of the decoded file content (header row)
   */
  detect(filename: string, firstLine: string): boolean

  /**
   * Parse the full decoded file content into a `Transaction[]`.
   * Each adapter is responsible for:
   *  - Splitting columns
   *  - Normalizing amounts (European decimal comma → float)
   *  - Parsing dates
   *  - Mapping bank-specific field names to the shared `Transaction` shape
   *
   * @param rawContent - Full file content, already decoded to a JS string
   *                     (UTF-8 / Windows-1252 decoding is done before calling parse)
   * @param sourceFile - Original filename; stored on each returned transaction
   */
  parse(rawContent: string, sourceFile: string): Transaction[]
}
