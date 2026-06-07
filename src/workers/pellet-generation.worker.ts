import type { MultiPolygon } from 'geojson'
import { generateAllPellets } from '../geo/pellets'
import type { Pellet, StreetSegment } from '../types'

export interface PelletWorkerRequest {
  segments: StreetSegment[]
  isochrone: MultiPolygon
  spacingMeters: number
}

export type PelletWorkerMessage =
  | { type: 'progress'; processed: number; total: number }
  | { type: 'done'; pellets: Pellet[] }

self.onmessage = (event: MessageEvent<PelletWorkerRequest>) => {
  const { segments, isochrone, spacingMeters } = event.data
  const pellets = generateAllPellets(segments, isochrone, spacingMeters, (processed, total) => {
    const message: PelletWorkerMessage = { type: 'progress', processed, total }
    self.postMessage(message)
  })
  const response: PelletWorkerMessage = { type: 'done', pellets }
  self.postMessage(response)
}
