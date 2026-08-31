<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RegionTotal } from '../lib/pricing'
import { formatCompact, formatInr, formatInt, formatRate, formatUsd } from '../lib/format'

const props = defineProps<{
  title: string
  note: string
  accent: 'us' | 'in'
  currency: 'USD' | 'INR'
  /** Multiplier applied to the USD list prices for display. 1 for the US panel. */
  fx: number
  totals: RegionTotal
  /** Other panel's monthly total, in USD, for the comparison chip. */
  compareUsd: number | null
  /** SKU id → ramp colour, assigned once for both panels so the same SKU keeps
      the same colour on each side. Anything absent falls into the remainder. */
  colors: Record<string, string>
  sourceUrl: string
}>()

const open = ref<Record<string, boolean>>({})

const money = (usd: number, precise = false) =>
  props.currency === 'INR' ? formatInr(usd * props.fx, precise) : formatUsd(usd * props.fx, precise)

const rate = (usd: number) => formatRate(usd, props.currency, props.fx)

const delta = computed(() => {
  if (props.compareUsd === null || props.compareUsd <= 0) return null
  const diff = props.totals.total - props.compareUsd
  return { diff, pct: (diff / props.compareUsd) * 100 }
})

const blended = computed(() =>
  props.totals.volume > 0 ? (props.totals.total / props.totals.volume) * 1000 : 0,
)

/**
 * Where the money actually goes. Segments run in this panel's own cost order,
 * but each colour is pinned to a SKU by the parent so a line reads as the same
 * colour in both panels; everything outside the shared ramp collapses into one
 * grey remainder rather than degrading the bar into confetti.
 */
const composition = computed(() => {
  const total = props.totals.total
  if (total <= 0) return []
  const paid = props.totals.lines.filter((l) => l.result.cost > 0)
  const segments = paid
    .filter((l) => props.colors[l.sku.id])
    .map((line) => ({
      key: line.sku.id,
      name: line.sku.name,
      share: (line.result.cost / total) * 100,
      color: props.colors[line.sku.id],
    }))
  const rest = paid.filter((l) => !props.colors[l.sku.id])
  if (rest.length) {
    const cost = rest.reduce((sum, l) => sum + l.result.cost, 0)
    segments.push({
      key: '__rest',
      name: `${rest.length} more SKU${rest.length === 1 ? '' : 's'}`,
      share: (cost / total) * 100,
      color: 'var(--c-rest)',
    })
  }
  return segments
})

/** Share of this panel's bill, used for the per-line proportion bar. */
function shareOf(cost: number) {
  return props.totals.total > 0 ? (cost / props.totals.total) * 100 : 0
}

function bandLabel(from: number, to: number) {
  return `${formatCompact(from)}–${formatCompact(to)}`
}
</script>

<template>
  <section class="panel card" :class="accent">
    <header class="head">
      <div class="title-row">
        <h2>{{ title }}</h2>
        <a class="src tiny-text" :href="sourceUrl" target="_blank" rel="noopener">price list ↗</a>
      </div>
      <p class="note tiny-text muted">{{ note }}</p>

      <div class="total num">
        <span class="amount">{{ money(totals.total) }}</span>
        <span class="per muted">/ month</span>
      </div>

      <div class="sub num tiny-text">
        <span class="muted">{{ money(totals.total * 12) }} / year</span>
        <span
          v-if="delta"
          class="chip"
          :class="delta.diff <= 0 ? 'cheaper' : 'pricier'"
          :title="`Difference vs the other panel, before currency conversion`"
        >
          {{ delta.diff <= 0 ? '▼' : '▲' }}
          {{ Math.abs(delta.pct).toFixed(delta.pct === 0 ? 0 : 1) }}%
          {{ delta.diff <= 0 ? 'lower' : 'higher' }}
        </span>
      </div>

      <dl class="stats num tiny-text">
        <div>
          <dt>Calls</dt>
          <dd>{{ formatInt(totals.volume) }}</dd>
        </div>
        <div>
          <dt>Free</dt>
          <dd>{{ formatInt(totals.freeEvents) }}</dd>
        </div>
        <div>
          <dt>Billable</dt>
          <dd>{{ formatInt(totals.billable) }}</dd>
        </div>
        <div>
          <dt>Blended /1k</dt>
          <dd>{{ rate(blended) }}</dd>
        </div>
      </dl>

      <div v-if="composition.length" class="composition">
        <div
          class="comp-bar"
          role="img"
          :aria-label="`Cost split: ${composition
            .map((s) => `${s.name} ${s.share.toFixed(0)}%`)
            .join(', ')}`"
        >
          <span
            v-for="seg in composition"
            :key="seg.key"
            :style="{ width: `${seg.share}%`, background: seg.color }"
            :title="`${seg.name} — ${seg.share.toFixed(1)}%`"
          />
        </div>
        <ul class="legend tiny-text">
          <li v-for="seg in composition" :key="seg.key">
            <span class="dot" :style="{ background: seg.color }" />
            <span class="lg-name">{{ seg.name }}</span>
            <span class="lg-share num muted">{{ seg.share.toFixed(0) }}%</span>
          </li>
        </ul>
      </div>
    </header>

    <div class="lines scroll">
      <p v-if="!totals.lines.length" class="empty muted tiny-text">
        Enter monthly call volumes on the left to build an estimate.
      </p>

      <div v-for="line in totals.lines" :key="line.sku.id" class="line">
        <button
          class="line-head"
          :aria-expanded="!!open[line.sku.id]"
          @click="open[line.sku.id] = !open[line.sku.id]"
        >
          <span class="chev" :class="{ open: open[line.sku.id] }" aria-hidden="true">▸</span>
          <span class="ln-name">
            {{ line.sku.name }}
            <span class="ln-vol muted tiny-text num">
              {{ formatInt(line.volume) }} {{ line.sku.unit }}
            </span>
          </span>
          <span class="ln-right">
            <span class="ln-cost num">
              <template v-if="line.result.unlimitedFree">
                <span class="freeflag">free</span>
              </template>
              <template v-else>{{ money(line.result.cost, true) }}</template>
            </span>
            <span
              v-if="!line.result.unlimitedFree && totals.total > 0"
              class="ln-share num tiny-text muted"
            >
              {{ shareOf(line.result.cost).toFixed(0) }}%
            </span>
          </span>
        </button>

        <div
          v-if="!line.result.unlimitedFree && totals.total > 0"
          class="bar ln-bar"
          aria-hidden="true"
        >
          <span :style="{ width: `${shareOf(line.result.cost)}%`, background: 'var(--tone)' }" />
        </div>

        <div v-if="open[line.sku.id]" class="breakdown">
          <p v-if="line.result.unlimitedFree" class="tiny-text muted">
            This SKU has no charge at any volume ({{ line.sku[accent].sku }}).
          </p>
          <template v-else>
            <table class="tiny-text num">
              <thead>
                <tr>
                  <th>Volume band</th>
                  <th>Billable</th>
                  <th>Per 1,000</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="line.result.freeEvents > 0" class="free-row">
                  <td>Free monthly cap</td>
                  <td>{{ formatInt(line.result.freeEvents) }}</td>
                  <td>{{ rate(0) }}</td>
                  <td>{{ money(0, true) }}</td>
                </tr>
                <tr v-for="(band, i) in line.result.bands" :key="i">
                  <td>{{ bandLabel(band.from, band.to) }}</td>
                  <td>{{ formatInt(band.qty) }}</td>
                  <td>{{ rate(band.per1000) }}</td>
                  <td>{{ money(band.cost, true) }}</td>
                </tr>
              </tbody>
            </table>
            <p class="tiny-text muted foot">
              SKU {{ line.sku[accent].sku }} · effective {{ rate(line.result.effectivePer1000) }} per
              1,000 across all {{ formatInt(line.volume) }} calls
            </p>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  --tone: var(--us);
  --tone-soft: var(--us-soft);
}

.panel.in {
  --tone: var(--in);
  --tone-soft: var(--in-soft);
}

/* The header carries the region's hue as a soft wash that fades into the
   surface, so the two panels read as distinct without hard colour blocks. */
.head {
  padding: 16px 18px 14px;
  background: linear-gradient(
    170deg,
    var(--tone-soft) 0%,
    color-mix(in srgb, var(--tone-soft) 45%, var(--surface)) 55%,
    var(--surface) 100%
  );
  border-bottom: 1px solid var(--border);
  position: relative;
}

/* Hairline of the region colour along the very top edge. */
.head::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  background: var(--tone);
  opacity: 0.75;
}

.title-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--tone);
  flex: 1;
}

.src {
  text-decoration: none;
  color: var(--text-3);
  font-weight: 500;
  transition: color 0.15s var(--ease);
}

.src:hover {
  color: var(--tone);
}

.note {
  margin: 4px 0 10px;
}

.total {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.amount {
  font-size: 36px;
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.05;
}

.sub {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 6px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 9px;
  border-radius: 999px;
  font-weight: 650;
  border: 1px solid transparent;
}

.chip.cheaper {
  background: var(--good-soft);
  color: var(--good);
  border-color: color-mix(in srgb, var(--good) 22%, transparent);
}

.chip.pricier {
  background: var(--bad-soft);
  color: var(--bad);
  border-color: color-mix(in srgb, var(--bad) 22%, transparent);
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 14px 0 0;
}

.stats div {
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 7px 9px;
  min-width: 0;
  backdrop-filter: blur(4px);
}

dt {
  color: var(--text-3);
  font-size: 10px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

dd {
  margin: 2px 0 0;
  font-weight: 650;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ------------------------------------------------------- cost composition */

.composition {
  margin-top: 12px;
}

.comp-bar {
  display: flex;
  gap: 2px;
  height: 9px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--surface-2);
}

.comp-bar > span {
  transition: width 0.35s var(--ease);
  min-width: 3px;
  border-radius: 2px;
}

.comp-bar > span:first-child {
  border-radius: 999px 2px 2px 999px;
}

.comp-bar > span:last-child {
  border-radius: 2px 999px 999px 2px;
}

.legend {
  list-style: none;
  margin: 9px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
}

.legend li {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  flex: none;
}

.lg-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
}

.lg-share {
  font-weight: 650;
  color: var(--text-3);
}

/* -------------------------------------------------------------- line list */

.lines {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.empty {
  padding: 40px 18px;
  text-align: center;
  line-height: 1.6;
}

.line {
  border-bottom: 1px solid var(--border);
  transition: background 0.15s var(--ease);
}

.line:last-child {
  border-bottom: 0;
}

.line:hover {
  background: var(--surface-2);
}

.line-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 16px 8px;
  background: none;
  border: 0;
  text-align: left;
}

.chev {
  color: var(--text-3);
  transition: transform 0.2s var(--ease), color 0.15s var(--ease);
  font-size: 11px;
}

.chev.open {
  transform: rotate(90deg);
  color: var(--tone);
}

.ln-name {
  flex: 1;
  min-width: 0;
  font-weight: 500;
}

.ln-vol {
  display: block;
  font-weight: 400;
  margin-top: 1px;
}

.ln-right {
  display: flex;
  align-items: baseline;
  gap: 9px;
  white-space: nowrap;
}

.ln-cost {
  font-weight: 650;
}

.ln-share {
  min-width: 30px;
  text-align: right;
  font-weight: 550;
}

/* Sits flush under its row, inset to line up with the name column. */
.ln-bar {
  height: 3px;
  margin: 0 16px 9px 32px;
  background: transparent;
}

.ln-bar > span {
  opacity: 0.5;
}

.breakdown {
  padding: 6px 16px 14px 32px;
  background: var(--surface-2);
  border-top: 1px solid var(--border);
}

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  text-align: right;
  color: var(--text-3);
  font-weight: 650;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 5px 0;
  border-bottom: 1px solid var(--border);
}

th:first-child,
td:first-child {
  text-align: left;
}

td {
  text-align: right;
  padding: 4px 0;
}

.free-row td {
  color: var(--good);
  font-weight: 550;
}

.foot {
  margin: 8px 0 0;
  line-height: 1.5;
}
</style>
