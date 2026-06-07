import type { FeatureCollection, MultiPolygon } from 'geojson'
import center from '@turf/center'
import { isochroneFeature, normalizeIsochrone } from './isochrone'
import { activeSegments, fetchStreetsFromOverpass } from './overpass'
import defaultIsochroneJson from '../default-isochrone.json'
import { PELLET_SPACING_METERS } from '../config'
import { db, setActiveLevelId } from '../db'
import type { Home, Level, Pellet, StreetSegment } from '../types'
import PelletWorker from '../workers/pellet-generation.worker?worker'

function createLevelId(): string {
  return crypto.randomUUID()
}

export async function createLevelFromIsochrone(options: {
  name: string
  home: Home
  travelMinutes: number
  isochrone: MultiPolygon
  onProgress?: (message: string, percent?: number) => void
  signal?: AbortSignal
}): Promise<Level> {
  const { name, home, travelMinutes, isochrone, onProgress, signal } = options
  const levelId = createLevelId()
  const now = new Date().toISOString()

  const level: Level = {
    id: levelId,
    name,
    home,
    mode: 'bike',
    travelMinutes,
    isochrone,
    createdAt: now,
    updatedAt: now,
  }

  onProgress?.('Fetching streets from OpenStreetMap…', 10)
  const segments = await fetchStreetsFromOverpass(isochrone, levelId, {
    signal,
    onProgress: (message, chunk, total) => {
      const percent = 10 + Math.round((chunk / total) * 30)
      onProgress?.(message, percent)
    },
  })
  const usable = activeSegments(segments)

  onProgress?.(`Placing pellets along ${usable.length} streets…`, 42)
  const pellets = await generatePelletsInWorker(usable, isochrone, PELLET_SPACING_METERS, (processed, total) => {
    const percent = 42 + Math.round((processed / total) * 46)
    onProgress?.(`Placing pellets (${processed.toLocaleString()}/${total.toLocaleString()} streets)…`, percent)
  })

  onProgress?.('Saving to local storage…', 90)
  await db.transaction('rw', [db.levels, db.segments, db.pellets, db.meta], async () => {
    await db.levels.put(level)
    await db.segments.bulkPut(segments)
    await db.pellets.bulkPut(pellets)
    await setActiveLevelId(levelId)
  })

  onProgress?.('Ready!', 100)
  return level
}

function generatePelletsInWorker(
  segments: StreetSegment[],
  isochrone: MultiPolygon,
  spacingMeters: number,
  onProgress?: (processed: number, total: number) => void,
): Promise<Pellet[]> {
  return new Promise((resolve, reject) => {
    const worker = new PelletWorker()
    worker.onmessage = (event: MessageEvent<{ type: string; processed?: number; total?: number; pellets?: Pellet[] }>) => {
      const data = event.data
      if (data.type === 'progress' && data.processed !== undefined && data.total !== undefined) {
        onProgress?.(data.processed, data.total)
        return
      }
      if (data.type === 'done' && data.pellets) {
        worker.terminate()
        resolve(data.pellets)
      }
    }
    worker.onerror = (error) => {
      worker.terminate()
      reject(error)
    }
    worker.postMessage({ segments, isochrone, spacingMeters })
  })
}

export function homeFromIsochrone(isochrone: MultiPolygon): Home {
  const c = center(isochroneFeature(isochrone))
  const [lon, lat] = c.geometry.coordinates
  return { lat, lon, label: 'Isochrone center' }
}

export function loadDefaultIsochrone(): MultiPolygon {
  return normalizeIsochrone(defaultIsochroneJson as FeatureCollection)
}
