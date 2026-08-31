import raw from '../data/pricing.json' with { type: 'json' }

export type Region = 'us' | 'in'

/** `upTo` is the cumulative monthly volume the tier extends to; null means "and above". */
export interface Tier {
  upTo: number | null
  per1000: number
}

export interface RegionPricing {
  sku: string
  /** null means the SKU is free at unlimited volume. */
  freeCap: number | null
  tiers: Tier[]
}

export interface Sku {
  id: string
  name: string
  group: string
  unit: string
  category: 'Essentials' | 'Pro' | 'Enterprise'
  legacy: boolean
  us: RegionPricing
  in: RegionPricing
}

export interface Catalog {
  generatedAt: string
  sources: Record<Region, string>
  skus: Sku[]
}

export const catalog = raw as unknown as Catalog

export const GROUP_ORDER = [
  'Maps',
  'Map Tiles',
  'Routes',
  'Navigation SDK',
  'Places',
  'Environment',
] as const

export interface Band {
  /** The actual billed slice of this tier, not the tier's own boundaries. */
  from: number
  to: number
  qty: number
  per1000: number
  cost: number
}

export interface SkuCost {
  volume: number
  freeEvents: number
  billable: number
  cost: number
  /** Blended cost per 1,000 calls across the whole volume. */
  effectivePer1000: number
  bands: Band[]
  unlimitedFree: boolean
}

const EMPTY: SkuCost = {
  volume: 0,
  freeEvents: 0,
  billable: 0,
  cost: 0,
  effectivePer1000: 0,
  bands: [],
  unlimitedFree: false,
}

/**
 * Google applies volume discounts on a graduated basis: usage that falls into
 * each tier is billed at that tier's rate, and the free cap is consumed out of
 * the first tier rather than shifting the tier boundaries up.
 *
 * Deliberately unbounded — there is no volume at which this returns
 * "contact sales".
 */
export function costFor(pricing: RegionPricing, volume: number, applyFreeCap = true): SkuCost {
  if (!Number.isFinite(volume) || volume <= 0) return { ...EMPTY }
  if (pricing.freeCap === null) {
    return { ...EMPTY, volume, freeEvents: volume, unlimitedFree: true }
  }

  const freeEvents = applyFreeCap ? Math.min(volume, pricing.freeCap) : 0
  const bands: Band[] = []
  let cursor = 0
  let cost = 0

  for (const tier of pricing.tiers) {
    const tierTop = tier.upTo ?? Infinity
    const from = Math.max(cursor, freeEvents)
    const to = Math.min(tierTop, volume)
    const qty = Math.max(0, to - from)
    if (qty > 0) {
      const bandCost = (qty / 1000) * tier.per1000
      cost += bandCost
      bands.push({ from, to, qty, per1000: tier.per1000, cost: bandCost })
    }
    cursor = tierTop
    if (cursor >= volume) break
  }

  const billable = Math.max(0, volume - freeEvents)
  return {
    volume,
    freeEvents,
    billable,
    cost,
    effectivePer1000: volume > 0 ? (cost / volume) * 1000 : 0,
    bands,
    unlimitedFree: false,
  }
}

export interface LineItem {
  sku: Sku
  volume: number
  result: SkuCost
}

export interface RegionTotal {
  lines: LineItem[]
  total: number
  billable: number
  freeEvents: number
  volume: number
}

export function totalFor(
  skus: Sku[],
  volumes: Record<string, number>,
  region: Region,
  applyFreeCap = true,
): RegionTotal {
  const lines: LineItem[] = []
  let total = 0
  let billable = 0
  let freeEvents = 0
  let volume = 0

  for (const sku of skus) {
    const v = volumes[sku.id] ?? 0
    if (v <= 0) continue
    const result = costFor(sku[region], v, applyFreeCap)
    lines.push({ sku, volume: v, result })
    total += result.cost
    billable += result.billable
    freeEvents += result.freeEvents
    volume += v
  }

  lines.sort((a, b) => b.result.cost - a.result.cost)
  return { lines, total, billable, freeEvents, volume }
}
