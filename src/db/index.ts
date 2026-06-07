import Dexie, { type EntityTable } from 'dexie'
import type { AppMeta, Level, Pellet, StreetSegment, TrackPoint } from '../types'

export class PelletTownDB extends Dexie {
  levels!: EntityTable<Level, 'id'>
  segments!: EntityTable<StreetSegment, 'id'>
  pellets!: EntityTable<Pellet, 'id'>
  meta!: EntityTable<AppMeta, 'id'>
  tracks!: EntityTable<TrackPoint & { id?: number }, 'id'>

  constructor() {
    super('pellet-town')
    this.version(1).stores({
      levels: 'id',
      segments: 'id, levelId, osmWayId',
      pellets: 'id, levelId, segmentId, eaten, [levelId+eaten]',
      meta: 'id',
      tracks: '++id, levelId, timestamp',
    })
  }
}

export const db = new PelletTownDB()

export async function getActiveLevelId(): Promise<string | undefined> {
  const meta = await db.meta.get('app')
  return meta?.activeLevelId
}

export async function setActiveLevelId(levelId: string): Promise<void> {
  await db.meta.put({ id: 'app', activeLevelId: levelId })
}

export async function computeLevelStats(levelId: string) {
  const all = await db.pellets.where('levelId').equals(levelId).toArray()
  const totalPellets = all.length
  const eatenPellets = all.filter((p) => p.eaten).length
  const percentComplete = totalPellets === 0 ? 0 : (eatenPellets / totalPellets) * 100
  const eatenSorted = all
    .filter((p) => p.eaten && p.eatenAt)
    .sort((a, b) => (a.eatenAt ?? '').localeCompare(b.eatenAt ?? ''))

  return {
    levelId,
    totalPellets,
    eatenPellets,
    percentComplete,
    lastActivityAt: eatenSorted.at(-1)?.eatenAt,
  }
}

export async function exportLevelData(levelId: string) {
  const level = await db.levels.get(levelId)
  if (!level) throw new Error('Level not found')

  const segments = await db.segments.where('levelId').equals(levelId).toArray()
  const pellets = await db.pellets.where('levelId').equals(levelId).toArray()
  const stats = await computeLevelStats(levelId)

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    level,
    segments,
    pellets,
    stats,
  }
}

export async function importLevelData(data: Awaited<ReturnType<typeof exportLevelData>>) {
  await db.transaction('rw', [db.levels, db.segments, db.pellets, db.meta], async () => {
    await db.levels.put(data.level)
    await db.segments.where('levelId').equals(data.level.id).delete()
    await db.pellets.where('levelId').equals(data.level.id).delete()
    await db.segments.bulkPut(data.segments)
    await db.pellets.bulkPut(data.pellets)
    await setActiveLevelId(data.level.id)
  })
}

export async function markPelletsEaten(
  pelletIds: string[],
  location: { lat: number; lon: number },
): Promise<Pellet[]> {
  if (pelletIds.length === 0) return []

  const eatenAt = new Date().toISOString()
  const updated: Pellet[] = []

  await db.transaction('rw', db.pellets, async () => {
    for (const pelletId of pelletIds) {
      const pellet = await db.pellets.get(pelletId)
      if (!pellet || pellet.eaten) continue

      const next: Pellet = {
        ...pellet,
        eaten: true,
        eatenAt,
        eatenLocation: location,
      }
      await db.pellets.put(next)
      updated.push(next)
    }
  })

  return updated
}

export async function markPelletEaten(
  pelletId: string,
  location: { lat: number; lon: number },
): Promise<Pellet | undefined> {
  const results = await markPelletsEaten([pelletId], location)
  return results[0]
}
