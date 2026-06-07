import type { LineString, MultiPolygon } from 'geojson'
import booleanIntersects from '@turf/boolean-intersects'
import { lineString } from '@turf/helpers'
import {
  EXCLUDED_ACCESS,
  EXCLUDED_HIGHWAY,
  STREET_HIGHWAY,
  OVERPASS_CHUNK_DELAY_MS,
  OVERPASS_ENDPOINTS,
  OVERPASS_MAX_RETRIES,
  OVERPASS_RETRY_BASE_MS,
} from '../config'
import { devLog, sleep } from '../lib/dev-log'
import type { StreetSegment } from '../types'
import { isochroneBounds, isochroneFeature } from './isochrone'

interface OverpassWay {
  type: 'way'
  id: number
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
}

interface OverpassResponse {
  elements?: OverpassWay[]
  remark?: string
}

type Bbox = [minLon: number, minLat: number, maxLon: number, maxLat: number]

function splitBbox(bbox: Bbox, gridSize: number): Bbox[] {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const lonStep = (maxLon - minLon) / gridSize
  const latStep = (maxLat - minLat) / gridSize
  const chunks: Bbox[] = []

  for (let x = 0; x < gridSize; x += 1) {
    for (let y = 0; y < gridSize; y += 1) {
      chunks.push([
        minLon + x * lonStep,
        minLat + y * latStep,
        minLon + (x + 1) * lonStep,
        minLat + (y + 1) * latStep,
      ])
    }
  }

  return chunks
}

function bboxLabel(bbox: Bbox): string {
  const [minLon, minLat, maxLon, maxLat] = bbox
  return `${minLat.toFixed(5)},${minLon.toFixed(5)} → ${maxLat.toFixed(5)},${maxLon.toFixed(5)}`
}

function wayToSegment(element: OverpassWay, levelId: string): StreetSegment | null {
  if (element.type !== 'way' || !element.geometry || element.geometry.length < 2) return null

  const tags = element.tags ?? {}
  const highway = tags.highway ?? 'unknown'
  const access = tags.access

  let filtered = false
  let filterReason: string | undefined

  if (EXCLUDED_HIGHWAY.has(highway)) {
    filtered = true
    filterReason = `highway=${highway}`
  } else if (!STREET_HIGHWAY.has(highway)) {
    filtered = true
    filterReason = `not a street (highway=${highway})`
  } else if (highway === 'service' && tags.service === 'parking_aisle') {
    filtered = true
    filterReason = 'parking aisle'
  } else if (access && EXCLUDED_ACCESS.has(access)) {
    filtered = true
    filterReason = `access=${access}`
  } else if (tags.bicycle === 'private' || tags.foot === 'private') {
    filtered = true
    filterReason = 'private access tag'
  }

  const geometry: LineString = {
    type: 'LineString',
    coordinates: element.geometry.map((node) => [node.lon, node.lat]),
  }

  return {
    id: `${levelId}-${element.id}`,
    levelId,
    osmWayId: element.id,
    geometry,
    name: tags.name,
    highway,
    filtered,
    filterReason,
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504
}

function retryDelayMs(attempt: number): number {
  return OVERPASS_RETRY_BASE_MS * 2 ** (attempt - 1)
}

async function fetchOverpassChunk(
  bbox: Bbox,
  chunkIndex: number,
  totalChunks: number,
  options?: {
    signal?: AbortSignal
    onStatus?: (message: string) => void
  },
): Promise<OverpassWay[]> {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const query = `[out:json][timeout:90];
way["highway"](${minLat},${minLon},${maxLat},${maxLon});
out geom;`
  const body = `data=${encodeURIComponent(query)}`
  const chunkLabel = `${chunkIndex}/${totalChunks}`
  const area = bboxLabel(bbox)

  devLog('info', `[Overpass] chunk ${chunkLabel} start`, { area })

  let lastError: Error | undefined

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= OVERPASS_MAX_RETRIES; attempt += 1) {
      const started = performance.now()

      if (attempt > 1 || endpoint !== OVERPASS_ENDPOINTS[0]) {
        options?.onStatus?.(
          `Chunk ${chunkLabel}: retry ${attempt}/${OVERPASS_MAX_RETRIES}…`,
        )
      }

      devLog('info', `[Overpass] chunk ${chunkLabel} request`, {
        endpoint,
        attempt,
        area,
      })

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: options?.signal,
        })

        const durationMs = Math.round(performance.now() - started)

        if (!response.ok) {
          const detail = `${response.status} ${response.statusText}`
          devLog('warn', `[Overpass] chunk ${chunkLabel} HTTP error`, {
            endpoint,
            attempt,
            status: response.status,
            durationMs,
          })

          if (isRetryableStatus(response.status) && attempt < OVERPASS_MAX_RETRIES) {
            const waitMs = retryDelayMs(attempt)
            devLog('warn', `[Overpass] chunk ${chunkLabel} backing off`, {
              waitMs,
              reason: detail,
            })
            options?.onStatus?.(`Chunk ${chunkLabel}: rate limited, waiting ${waitMs / 1000}s…`)
            await sleep(waitMs, options?.signal)
            continue
          }

          throw new Error(`Overpass HTTP ${detail} from ${endpoint}`)
        }

        const data = (await response.json()) as OverpassResponse
        const elements = data.elements ?? []

        devLog('info', `[Overpass] chunk ${chunkLabel} ok`, {
          endpoint,
          attempt,
          durationMs,
          ways: elements.length,
          remark: data.remark,
        })

        return elements
      } catch (error) {
        const durationMs = Math.round(performance.now() - started)
        lastError = error instanceof Error ? error : new Error(String(error))

        const retryable =
          lastError.name === 'TypeError' ||
          lastError.message.includes('NetworkError') ||
          lastError.message.includes('fetch')

        devLog(retryable ? 'warn' : 'error', `[Overpass] chunk ${chunkLabel} failed`, {
          endpoint,
          attempt,
          durationMs,
          error: lastError.message,
          retryable,
        })

        if (retryable && attempt < OVERPASS_MAX_RETRIES) {
          const waitMs = retryDelayMs(attempt)
          devLog('warn', `[Overpass] chunk ${chunkLabel} backing off`, {
            waitMs,
            reason: lastError.message,
          })
          options?.onStatus?.(`Chunk ${chunkLabel}: network error, waiting ${waitMs / 1000}s…`)
          await sleep(waitMs, options?.signal)
          continue
        }

        break
      }
    }
  }

  devLog('error', `[Overpass] chunk ${chunkLabel} exhausted retries`, {
    area,
    error: lastError?.message,
  })
  throw lastError ?? new Error(`All Overpass endpoints failed for chunk ${chunkLabel}`)
}

export async function fetchStreetsFromOverpass(
  isochrone: MultiPolygon,
  levelId: string,
  options?: {
    signal?: AbortSignal
    onProgress?: (message: string, chunk: number, total: number) => void
  },
): Promise<StreetSegment[]> {
  const bbox = isochroneBounds(isochrone)
  const chunks = splitBbox(bbox, 4)
  const wayMap = new Map<number, StreetSegment>()
  const isochronePoly = isochroneFeature(isochrone)

  devLog('info', '[Overpass] fetch started', {
    chunks: chunks.length,
    bbox,
  })

  for (let i = 0; i < chunks.length; i += 1) {
    const chunkNumber = i + 1

    options?.onProgress?.(
      `Fetching streets from OpenStreetMap (${chunkNumber}/${chunks.length})…`,
      chunkNumber,
      chunks.length,
    )

    const elements = await fetchOverpassChunk(chunks[i], chunkNumber, chunks.length, {
      signal: options?.signal,
      onStatus: (message) => options?.onProgress?.(message, chunkNumber, chunks.length),
    })

    for (const element of elements) {
      const segment = wayToSegment(element, levelId)
      if (segment) wayMap.set(segment.osmWayId, segment)
    }

    devLog('info', `[Overpass] chunk ${chunkNumber}/${chunks.length} merged`, {
      uniqueWays: wayMap.size,
    })

    if (i < chunks.length - 1 && OVERPASS_CHUNK_DELAY_MS > 0) {
      devLog('info', `[Overpass] chunk ${chunkNumber}/${chunks.length} pause`, {
        waitMs: OVERPASS_CHUNK_DELAY_MS,
      })
      options?.onProgress?.(
        `Pausing ${OVERPASS_CHUNK_DELAY_MS / 1000}s before next chunk…`,
        chunkNumber,
        chunks.length,
      )
      await sleep(OVERPASS_CHUNK_DELAY_MS, options?.signal)
    }
  }

  const segments = [...wayMap.values()].filter((segment) => {
    if (segment.filtered) return true
    return booleanIntersects(lineString(segment.geometry.coordinates), isochronePoly)
  })

  devLog('info', '[Overpass] fetch complete', {
    segments: segments.length,
    active: segments.filter((segment) => !segment.filtered).length,
  })

  return segments
}

export function activeSegments(segments: StreetSegment[]): StreetSegment[] {
  return segments.filter((segment) => !segment.filtered)
}
