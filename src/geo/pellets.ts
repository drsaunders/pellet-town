import type { Feature, Point } from 'geojson'
import along from '@turf/along'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import distance from '@turf/distance'
import length from '@turf/length'
import { lineString, point } from '@turf/helpers'
import type { MultiPolygon } from 'geojson'
import { PELLET_SPACING_METERS } from '../config'
import type { Pellet, StreetSegment } from '../types'

export function pelletId(levelId: string, segmentId: string, index: number): string {
  return `${levelId}:${segmentId}:${index}`
}

export function generatePelletsForSegment(
  segment: StreetSegment,
  isochrone: MultiPolygon,
  spacingMeters = PELLET_SPACING_METERS,
): Pellet[] {
  const line = lineString(segment.geometry.coordinates)
  const totalLength = length(line, { units: 'meters' })
  if (totalLength < spacingMeters) return []

  const pellets: Pellet[] = []
  const isochroneFeature = { type: 'Feature' as const, properties: {}, geometry: isochrone }

  let index = 0
  for (let dist = 0; dist <= totalLength; dist += spacingMeters) {
    const sample = along(line, dist, { units: 'meters' })
    if (!booleanPointInPolygon(sample, isochroneFeature)) continue

    const [lon, lat] = sample.geometry.coordinates
    pellets.push({
      id: pelletId(segment.levelId, segment.id, index),
      levelId: segment.levelId,
      segmentId: segment.id,
      position: { lat, lon },
      indexAlongSegment: index,
      eaten: false,
    })
    index += 1
  }

  return pellets
}

export function dedupePelletsByProximity(pellets: Pellet[], minMeters = 5): Pellet[] {
  const kept: Pellet[] = []

  for (const pellet of pellets) {
    const tooClose = kept.some((existing) => {
      return (
        distance(
          point([existing.position.lon, existing.position.lat]),
          point([pellet.position.lon, pellet.position.lat]),
          { units: 'meters' },
        ) < minMeters
      )
    })
    if (!tooClose) kept.push(pellet)
  }

  return kept
}

export function generateAllPellets(
  segments: StreetSegment[],
  isochrone: MultiPolygon,
  spacingMeters = PELLET_SPACING_METERS,
  onProgress?: (processed: number, total: number) => void,
): Pellet[] {
  const raw: Pellet[] = []

  for (let i = 0; i < segments.length; i += 1) {
    raw.push(...generatePelletsForSegment(segments[i], isochrone, spacingMeters))
    if (i % 25 === 0 || i === segments.length - 1) {
      onProgress?.(i + 1, segments.length)
    }
  }

  onProgress?.(segments.length, segments.length)
  return dedupePelletsByProximity(raw)
}

export function pelletsToGeoJSON(pellets: Pellet[]): Feature<Point>[] {
  return pellets.map((pellet) => ({
    type: 'Feature',
    properties: { id: pellet.id, eaten: pellet.eaten },
    geometry: {
      type: 'Point',
      coordinates: [pellet.position.lon, pellet.position.lat],
    },
  }))
}

export function eatenPelletsToGeoJSON(pellets: Pellet[]): Feature<Point>[] {
  return pelletsToGeoJSON(pellets.filter((p) => p.eaten))
}

export function uneatenPelletsToGeoJSON(pellets: Pellet[]): Feature<Point>[] {
  return pelletsToGeoJSON(pellets.filter((p) => !p.eaten))
}
