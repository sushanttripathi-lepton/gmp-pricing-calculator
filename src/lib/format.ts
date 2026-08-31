const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const plain = new Intl.NumberFormat('en-US')

export const formatInt = (n: number) => plain.format(Math.round(n))
export const formatCompact = (n: number) => (n < 1000 ? plain.format(n) : compact.format(n))

export function formatUsd(n: number, precise = false) {
  const maximumFractionDigits = precise || Math.abs(n) < 100 ? 2 : 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits === 2 ? 2 : 0,
  }).format(n)
}

export function formatInr(n: number, precise = false) {
  const maximumFractionDigits = precise || Math.abs(n) < 100 ? 2 : 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits === 2 ? 2 : 0,
  }).format(n)
}

/** Prices per 1,000 calls are small; keep enough precision to see $0.045. */
export function formatRate(n: number, currency: 'USD' | 'INR', fx = 1) {
  const v = n * fx
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(v) < 1 ? 3 : 2,
  }).format(v)
}

/** Accepts "1200", "1,200", "1.5m", "250k", "2 M". */
export function parseVolume(input: string): number {
  const s = input.trim().toLowerCase().replace(/,/g, '').replace(/\s+/g, '')
  if (!s) return 0
  const m = s.match(/^(\d*\.?\d+)([kmb])?$/)
  if (!m) return NaN
  const mult = m[2] === 'b' ? 1e9 : m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1
  return Math.round(Number(m[1]) * mult)
}
