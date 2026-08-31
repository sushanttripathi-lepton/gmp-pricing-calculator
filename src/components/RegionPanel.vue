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
    </header>

    <div class="lines scroll">
      <p v-if="!totals.lines.length" class="empty muted tiny-text">
        Enter monthly call volumes on the left to build an estimate.
      </p>

      <div v-for="line in totals.lines" :key="line.sku.id" class="line">
        <button class="line-head" @click="open[line.sku.id] = !open[line.sku.id]">
          <span class="chev" :class="{ open: open[line.sku.id] }">▸</span>
          <span class="ln-name">
            {{ line.sku.name }}
            <span class="ln-vol muted tiny-text num">
              {{ formatInt(line.volume) }} {{ line.sku.unit }}
            </span>
          </span>
          <span class="ln-cost num">
            <template v-if="line.result.unlimitedFree">
              <span class="freeflag">free</span>
            </template>
            <template v-else>{{ money(line.result.cost, true) }}</template>
          </span>
        </button>

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

.head {
  padding: 14px 16px 12px;
  background: var(--tone-soft);
  border-bottom: 1px solid var(--border);
}

.title-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--tone);
  flex: 1;
}

.src {
  text-decoration: none;
  color: var(--text-2);
}

.src:hover {
  text-decoration: underline;
}

.note {
  margin: 2px 0 8px;
}

.total {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.amount {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.sub {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.chip {
  padding: 1px 8px;
  border-radius: 999px;
  font-weight: 600;
}

.chip.cheaper {
  background: color-mix(in srgb, var(--good) 16%, transparent);
  color: var(--good);
}

.chip.pricier {
  background: color-mix(in srgb, var(--bad) 16%, transparent);
  color: var(--bad);
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 12px 0 0;
}

.stats div {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 8px;
  min-width: 0;
}

dt {
  color: var(--text-3);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

dd {
  margin: 1px 0 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lines {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.empty {
  padding: 28px 16px;
  text-align: center;
}

.line {
  border-bottom: 1px solid var(--border);
}

.line-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  background: none;
  border: 0;
  text-align: left;
}

.line-head:hover {
  background: var(--surface-2);
}

.chev {
  color: var(--text-3);
  transition: transform 0.15s;
}

.chev.open {
  transform: rotate(90deg);
}

.ln-name {
  flex: 1;
  min-width: 0;
}

.ln-vol {
  display: block;
}

.ln-cost {
  font-weight: 600;
  white-space: nowrap;
}

.freeflag {
  color: var(--good);
  font-weight: 600;
}

.breakdown {
  padding: 4px 14px 12px 30px;
  background: var(--surface-2);
}

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  text-align: right;
  color: var(--text-3);
  font-weight: 600;
  padding: 3px 0;
  border-bottom: 1px solid var(--border);
}

th:first-child,
td:first-child {
  text-align: left;
}

td {
  text-align: right;
  padding: 3px 0;
}

.free-row td {
  color: var(--good);
}

.foot {
  margin: 6px 0 0;
}
</style>
