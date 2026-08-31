/**
 * Checks the calculator against the two worked examples Google publishes on its
 * own price lists, plus the free-cap / unlimited / top-tier edge cases.
 *
 *   node scripts/verify-pricing.ts
 */
import { catalog, costFor } from '../src/lib/pricing.ts'

const sku = (name: string) => {
  const found = catalog.skus.find((s) => s.name === name)
  if (!found) throw new Error(`no SKU named "${name}"`)
  return found
}

const cases: Array<[string, number, number]> = [
  // [description, actual, expected]
  ['US Autocomplete Requests @ 200,000 (Google example)', costFor(sku('Autocomplete Requests').us, 200_000).cost, 481.7],
  ['India Autocomplete Requests @ 6,000,000 (Google example)', costFor(sku('Autocomplete Requests').in, 6_000_000).cost, 4400.5],
  ['US Dynamic Maps @ 10,000 — entirely inside the free cap', costFor(sku('Dynamic Maps').us, 10_000).cost, 0],
  ['US Dynamic Maps @ 10,001 — one call past the free cap', costFor(sku('Dynamic Maps').us, 10_001).cost, 0.007],
  ['US Autocomplete @ 200,000 with free caps disabled', costFor(sku('Autocomplete Requests').us, 200_000, false).cost, 510],
  ['Embed @ 1,000,000,000 — unlimited free SKU', costFor(sku('Embed').us, 1e9).cost, 0],
  ['US Dynamic Maps @ 50,000,000 — well into the top tier', costFor(sku('Dynamic Maps').us, 50_000_000).cost, 37_220],
  ['India Dynamic Maps @ 50,000,000 — two-tier India ladder', costFor(sku('Dynamic Maps').in, 50_000_000).cost, 34_203],
]

let failed = 0
for (const [label, actual, expected] of cases) {
  const ok = Math.abs(actual - expected) < 0.005
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n      got ${actual}, expected ${expected}`)
}
console.log(`\n${cases.length - failed}/${cases.length} passed`)
process.exit(failed ? 1 : 0)
