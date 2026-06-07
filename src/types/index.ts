import type { Feature, FeatureCollection, LineString, MultiPolygon, Point, Position } from 'geojson'

export type TransportMode = 'bike' | 'walk' | 'car'

export interface Home {
  lat: number
  lon: number
  label?: string
}

export interface Level {
  id: string
  name: string
  home: Home
  mode: TransportMode
  travelMinutes: number
  isochrone: MultiPolygon
  createdAt: string
  updatedAt: string
}

export interface StreetSegment {
  id: string
  levelId: string
  osmWayId: number
  geometry: LineString
  name?: string
  highway: string
  filtered: boolean
  filterReason?: string
}

export interface Pellet {
  id: string
  levelId: string
  segmentId: string
  position: { lat: number; lon: number }
  indexAlongSegment: number
  eaten: boolean
  eatenAt?: string
  eatenLocation?: { lat: number; lon: number }
}

export interface LevelStats {
  levelId: string
  totalPellets: number
  eatenPellets: number
  percentComplete: number
  lastActivityAt?: string
}

export interface TrackPoint {
  levelId: string
  lat: number
  lon: number
  timestamp: string
  accuracy?: number
}

export interface AppMeta {
  id: string
  activeLevelId?: string
  lastExportAt?: string
}

export type PelletFeature = Feature<Point, {
  id: string
  eaten: boolean
}>

export type PelletFeatureCollection = FeatureCollection<Point, PelletFeature['properties']>

export type LonLat = { lon: number; lat: number }

export function positionToLonLat(position: Position): LonLat {
  return { lon: position[0], lat: position[1] }
}

export function lonLatToPosition({ lon, lat }: LonLat): Position {
  return [lon, lat]
}
