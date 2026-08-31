/**
 * Regenerates src/data/pricing.json from Google's two official price lists.
 *
 *   node scripts/build-pricing.mjs
 *
 * The two pages have identical table/row ordering, so SKUs are matched by
 * position. If Google ever reorders them the script fails loudly rather than
 * silently pairing the wrong rows.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../src/data/pricing.json')

const SOURCES = {
  us: 'https://developers.google.com/maps/billing-and-pricing/pricing?hl=en',
  in: 'https://developers.google.com/maps/billing-and-pricing/pricing-india?hl=en',
}

/** Table index on the page -> product group. Tables 0/1 are the legend + worked example. */
const GROUPS = {
  2: { group: 'Maps', unit: 'map loads' },
  3: { group: 'Map Tiles', unit: 'tile requests' },
  4: { group: 'Map Tiles', unit: 'tile requests' },
  5: { group: 'Routes', unit: 'requests' },
  6: { group: 'Navigation SDK', unit: 'navigation requests' },
  7: { group: 'Places', unit: 'requests' },
  8: { group: 'Environment', unit: 'requests' },
  9: { group: 'Places', unit: 'requests', legacy: true },
  10: { group: 'Routes', unit: 'requests', legacy: true },
}

const SKU_ID = /([0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})\s*$/

const text = (html) =>
  html
    .replace(/<[^>]*>/g, '|')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\|+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function parseTables(html) {
  return (html.match(/<table[\s\S]*?<\/table>/g) || []).map((t) =>
    (t.match(/<tr[\s\S]*?<\/tr>/g) || []).map((r) =>
      (r.match(/<t[hd][\s\S]*?<\/t[hd]>/g) || []).map(text),
    ),
  )
}

const num = (s) => Number(String(s).replace(/[^0-9.]/g, ''))

/** "Cap - 100,000" / "100,001 - 500,000" / "5,000,000+" -> cumulative upper bound. */
function upperBound(header) {
  if (/\+\s*$/.test(header)) return Infinity
  const parts = header.split('-').map((p) => p.trim())
  return num(parts[parts.length - 1])
}

function parseSkuTable(rows, meta) {
  const header = rows[0]
  const bounds = header.slice(2).map(upperBound)
  let category = 'Essentials'
  const skus = []

  for (const row of rows.slice(1)) {
    if (row.length === 1) {
      category = row[0].trim()
      continue
    }
    if (row.length < 3) continue

    const raw = row[0].trim()
    const m = raw.match(SKU_ID)
    if (!m) continue
    const sku = m[1]
    // Strip the region suffix and any footnote marker, in whatever order they
    // appear: "Speed Limits (India) 1", "Place Details Essentials (IDs Only) (India)".
    let name = raw.slice(0, m.index).trim()
    for (let prev = null; prev !== name; ) {
      prev = name
      name = name
        .replace(/\s+\d$/, '')
        .replace(/\(India\)$/i, '')
        .trim()
    }

    const capCell = row[1].trim()
    const unlimited = /unlimited/i.test(capCell)
    const tiers = row
      .slice(2)
      .map((cell, i) => ({ upTo: bounds[i], per1000: /^\s*[-–—]\s*$/.test(cell) ? 0 : num(cell) }))

    skus.push({
      sku,
      name,
      category,
      group: meta.group,
      unit: meta.unit,
      legacy: !!meta.legacy,
      freeCap: unlimited ? Infinity : num(capCell),
      tiers: unlimited ? [{ upTo: Infinity, per1000: 0 }] : tiers,
    })
  }
  return skus
}

async function load(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return parseTables(await res.text())
}

const [usTables, inTables] = await Promise.all([load(SOURCES.us), load(SOURCES.in)])

const catalog = []
for (const [idx, meta] of Object.entries(GROUPS)) {
  const us = parseSkuTable(usTables[idx], meta)
  const india = parseSkuTable(inTables[idx], meta)
  if (us.length !== india.length) {
    throw new Error(`table ${idx}: US has ${us.length} SKUs, India has ${india.length} — layout changed`)
  }
  us.forEach((u, i) => {
    const n = india[i]
    if (u.name !== n.name) {
      throw new Error(`table ${idx} row ${i}: "${u.name}" vs "${n.name}" — row order changed`)
    }
    catalog.push({
      id: `${meta.group}:${u.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      name: u.name,
      group: u.group,
      unit: u.unit,
      category: u.category,
      legacy: u.legacy,
      us: { sku: u.sku, freeCap: u.freeCap, tiers: u.tiers },
      in: { sku: n.sku, freeCap: n.freeCap, tiers: n.tiers },
    })
  })
}

// Infinity is not valid JSON — serialise as null and rehydrate in the app.
const json = JSON.stringify(
  { generatedAt: new Date().toISOString().slice(0, 10), sources: SOURCES, skus: catalog },
  (_k, v) => (v === Infinity ? null : v),
  2,
)
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, json + '\n')
console.log(`wrote ${catalog.length} SKUs -> ${OUT}`)
