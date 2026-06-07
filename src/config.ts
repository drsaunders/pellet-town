export const PELLET_SPACING_METERS = 50
export const CAPTURE_RADIUS_METERS = 20
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
export const OVERPASS_ENDPOINTS = import.meta.env.DEV
  ? ['/overpass/de/api/interpreter', '/overpass/kumi/api/interpreter']
  : [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
    ]

export const OVERPASS_CHUNK_DELAY_MS = 1500
export const OVERPASS_MAX_RETRIES = 4
export const OVERPASS_RETRY_BASE_MS = 2000
export const EXCLUDED_HIGHWAY = new Set([
  'bus_stop',
  'elevator',
  'escape',
  'platform',
  'proposed',
  'construction',
  'raceway',
  'steps',
  'cycleway',
  'path',
  'footway',
  'pedestrian',
  'bridleway',
  'corridor',
  'track',
])

/** OSM highway types treated as driveable streets (excludes bike lanes, paths, etc.). */
export const STREET_HIGHWAY = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'residential',
  'living_street',
  'service',
  'road',
])

export const EXCLUDED_ACCESS = new Set(['private', 'no', 'customers'])
