import { CAPTURE_RADIUS_METERS } from '../config'
import { markPelletsEaten } from '../db'
import type { Pellet } from '../types'
import { PelletSpatialIndex } from './spatial-index'

export class PelletEater {
  private index = new PelletSpatialIndex()
  private lastProcessedAt = 0

  loadPellets(pellets: Pellet[]): void {
    this.index.load(pellets)
  }

  async tryEatAllWithin(
    lat: number,
    lon: number,
    radiusMeters = CAPTURE_RADIUS_METERS,
  ): Promise<Pellet[]> {
    const now = Date.now()
    if (now - this.lastProcessedAt < 1000) return []
    this.lastProcessedAt = now

    const inRange = this.index.findAllWithin(lon, lat, radiusMeters)
    if (inRange.length === 0) return []

    const updated = await markPelletsEaten(
      inRange.map((pellet) => pellet.id),
      { lat, lon },
    )
    this.index.removeMany(updated.map((pellet) => pellet.id))
    return updated
  }
}
