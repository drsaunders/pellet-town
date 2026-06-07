import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import bbox from '@turf/bbox'
import { multiPolygon } from '@turf/helpers'

export function normalizeIsochrone(input: FeatureCollection | Feature): MultiPolygon {
  if (input.type === 'FeatureCollection') {
    const polygons: MultiPolygon['coordinates'] = []
    for (const feature of input.features) {
      appendGeometry(polygons, feature.geometry)
    }
    if (polygons.length === 0) throw new Error('No polygon geometry found in FeatureCollection')
    return multiPolygon(polygons).geometry
  }

  const polygons: MultiPolygon['coordinates'] = []
  appendGeometry(polygons, input.geometry)
  if (polygons.length === 0) throw new Error('No polygon geometry found in Feature')
  return multiPolygon(polygons).geometry
}

function appendGeometry(
  target: MultiPolygon['coordinates'],
  geometry: Feature['geometry'],
): void {
  if (geometry.type === 'Polygon') {
    target.push(geometry.coordinates)
  } else if (geometry.type === 'MultiPolygon') {
    target.push(...geometry.coordinates)
  } else {
    throw new Error(`Unsupported geometry type: ${geometry.type}`)
  }
}

export function isochroneBounds(isochrone: MultiPolygon): [number, number, number, number] {
  return bbox({ type: 'Feature', properties: {}, geometry: isochrone }) as [
    number,
    number,
    number,
    number,
  ]
}

export function polygonToOverpassPoly(isochrone: MultiPolygon): string {
  const outerRing = isochrone.coordinates[0]?.[0]
  if (!outerRing) throw new Error('Isochrone has no outer ring')
  return outerRing.map(([lon, lat]) => `${lat} ${lon}`).join(' ')
}

export function isochroneFeature(isochrone: MultiPolygon): Feature<MultiPolygon> {
  return { type: 'Feature', properties: {}, geometry: isochrone }
}

export function parseIsochroneJson(text: string): MultiPolygon {
  const parsed = JSON.parse(text) as FeatureCollection | Feature
  if (parsed.type === 'FeatureCollection' || parsed.type === 'Feature') {
    return normalizeIsochrone(parsed)
  }
  throw new Error('Invalid GeoJSON: expected Feature or FeatureCollection')
}

export function isPolygonGeometry(
  geometry: Feature['geometry'],
): geometry is Polygon | MultiPolygon {
  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon'
}
