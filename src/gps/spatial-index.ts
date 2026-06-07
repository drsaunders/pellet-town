import RBush from 'rbush'
import type { Pellet } from '../types'

export interface PelletIndexItem {
  minX: number
  minY: number
  maxX: number
  maxY: number
  pellet: Pellet
}

export class PelletSpatialIndex {
  private tree = new RBush<PelletIndexItem>()

  load(pellets: Pellet[]): void {
    this.tree.clear()
    this.tree.load(
      pellets
        .filter((p) => !p.eaten)
        .map((pellet) => ({
          minX: pellet.position.lon,
          minY: pellet.position.lat,
          maxX: pellet.position.lon,
          maxY: pellet.position.lat,
          pellet,
        })),
    )
  }

  remove(pelletId: string): void {
    const all = this.tree.all()
    this.tree.clear()
    this.tree.load(all.filter((item) => item.pellet.id !== pelletId))
  }

  removeMany(pelletIds: string[]): void {
    if (pelletIds.length === 0) return
    const drop = new Set(pelletIds)
    const all = this.tree.all()
    this.tree.clear()
    this.tree.load(all.filter((item) => !drop.has(item.pellet.id)))
  }

  findAllWithin(lon: number, lat: number, radiusMeters: number): Pellet[] {
    const latDelta = radiusMeters / 111_320
    const lonDelta = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180))

    const candidates = this.tree.search({
      minX: lon - lonDelta,
      minY: lat - latDelta,
      maxX: lon + lonDelta,
      maxY: lat + latDelta,
    })

    const within: Pellet[] = []

    for (const item of candidates) {
      const dLon = item.pellet.position.lon - lon
      const dLat = item.pellet.position.lat - lat
      const approxMeters = Math.hypot(
        dLon * 111_320 * Math.cos((lat * Math.PI) / 180),
        dLat * 111_320,
      )

      if (approxMeters <= radiusMeters) {
        within.push(item.pellet)
      }
    }

    return within
  }
}
