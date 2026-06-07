import { PelletEater } from './eat-logic'
import type { Pellet } from '../types'

export interface UserPosition {
  lat: number
  lon: number
  accuracy?: number
}

export async function applyUserPosition(
  eater: PelletEater,
  position: UserPosition,
  options?: { skipThrottle?: boolean },
): Promise<Pellet[]> {
  return eater.tryEatAllWithin(position.lat, position.lon, undefined, options)
}
