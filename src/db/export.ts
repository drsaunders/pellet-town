import { exportLevelData } from '../db'
import type { Level } from '../types'

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'save'
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Download the full game state: map, streets, pellets, and progress. */
export async function exportSaveFile(level: Level): Promise<void> {
  const data = await exportLevelData(level.id)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  triggerDownload(`pellet-town-${slugify(level.name)}.json`, blob)
}
