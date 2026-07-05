/**
 * StateStore — server-side filesystem persistence for all derived state.
 *
 * Each state key maps to a versioned JSON file under STATE_PATH:
 *
 *   categories  → STATE_PATH/categories.json
 *   exclusions  → STATE_PATH/exclusions.json
 *   rules       → STATE_PATH/rules.json
 *   anomalies   → STATE_PATH/anomalies.json
 *   insights/2024-07 → STATE_PATH/insights/2024-07.json
 *
 * Writes are atomic: data is first written to a `.tmp` file then renamed
 * to the target, preventing corrupt reads if the server crashes mid-write.
 *
 * Issue #22.
 */

import { readFile, writeFile, rename, unlink, mkdir, access, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

// ─── Versioned envelope ───────────────────────────────────────────────────────

interface StateEnvelope<T> {
  version: 1
  lastUpdated: string
  data: T
}

// ─── Summary entry ────────────────────────────────────────────────────────────

export interface StateSummaryEntry {
  exists: boolean
  lastUpdated: string | null
  sizeBytes: number | null
}

// ─── StateStore ───────────────────────────────────────────────────────────────

export class StateStore {
  constructor(private readonly basePath: string) {}

  /** Resolve a key to an absolute file path. */
  private filePath(key: string): string {
    return path.join(this.basePath, `${key}.json`)
  }

  /**
   * Read state for a key.
   * Returns `null` when the file doesn't exist or is unreadable.
   */
  async read<T>(key: string): Promise<T | null> {
    try {
      const raw = await readFile(this.filePath(key), 'utf-8')
      const envelope = JSON.parse(raw) as StateEnvelope<T>
      return envelope.data ?? null
    } catch {
      return null
    }
  }

  /**
   * Read the full versioned envelope for a key (includes `lastUpdated`).
   * Returns `null` when the file doesn't exist.
   */
  async readEnvelope<T>(key: string): Promise<StateEnvelope<T> | null> {
    try {
      const raw = await readFile(this.filePath(key), 'utf-8')
      return JSON.parse(raw) as StateEnvelope<T>
    } catch {
      return null
    }
  }

  /**
   * Write data for a key atomically.
   * Creates parent directories if they don't exist.
   */
  async write<T>(key: string, data: T): Promise<void> {
    const dest = this.filePath(key)
    const tmp = `${dest}.tmp`

    const envelope: StateEnvelope<T> = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      data,
    }

    await mkdir(path.dirname(dest), { recursive: true })
    await writeFile(tmp, JSON.stringify(envelope, null, 2), 'utf-8')
    await rename(tmp, dest)
  }

  /**
   * Delete the file for a key.
   * Silently ignores missing files.
   */
  async delete(key: string): Promise<void> {
    try {
      await unlink(this.filePath(key))
    } catch {
      // File doesn't exist — nothing to do
    }
  }

  /** Returns `true` if the file for a key exists. */
  async exists(key: string): Promise<boolean> {
    try {
      await access(this.filePath(key))
      return true
    } catch {
      return false
    }
  }

  /**
   * Delete all state JSON files under STATE_PATH.
   * Returns a list of deleted filenames (relative to STATE_PATH).
   */
  async reset(): Promise<string[]> {
    const deleted: string[] = []

    const topKeys = ['categories', 'exclusions', 'rules', 'anomalies']
    for (const key of topKeys) {
      const fp = this.filePath(key)
      try {
        await unlink(fp)
        deleted.push(`${key}.json`)
      } catch {
        // Doesn't exist — skip
      }
    }

    // Clean insights/ subdirectory
    const insightsDir = path.join(this.basePath, 'insights')
    try {
      const files = await readdir(insightsDir)
      for (const f of files.filter((f) => f.endsWith('.json'))) {
        try {
          await unlink(path.join(insightsDir, f))
          deleted.push(`insights/${f}`)
        } catch {
          // ignore individual failures
        }
      }
    } catch {
      // insights/ dir doesn't exist — nothing to do
    }

    return deleted
  }

  /**
   * List available insight period keys (e.g. ["2024-06", "2024-07"]).
   */
  async listInsightPeriods(): Promise<string[]> {
    try {
      const insightsDir = path.join(this.basePath, 'insights')
      const files = await readdir(insightsDir)
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''))
        .sort()
    } catch {
      return []
    }
  }

  /**
   * Returns metadata about all top-level state keys.
   */
  async summary(): Promise<Record<string, StateSummaryEntry>> {
    const keys = ['categories', 'exclusions', 'rules', 'anomalies']
    const result: Record<string, StateSummaryEntry> = {}

    for (const key of keys) {
      const fp = this.filePath(key)
      try {
        const [raw, stats] = await Promise.all([
          readFile(fp, 'utf-8'),
          stat(fp),
        ])
        const envelope = JSON.parse(raw) as StateEnvelope<unknown>
        result[key] = {
          exists: true,
          lastUpdated: envelope.lastUpdated ?? null,
          sizeBytes: stats.size,
        }
      } catch {
        result[key] = { exists: false, lastUpdated: null, sizeBytes: null }
      }
    }

    return result
  }
}
