<script setup lang="ts">
import { computed } from 'vue'
import { formatCompact, formatMoneyCompact, formatRate } from '../lib/format'

export interface ProjectionRow {
  mult: number
  volume: number
  /** Both totals in USD; the component converts for display. */
  us: number
  in: number
}

const props = defineProps<{
  rows: ProjectionRow[]
  showUs: boolean
  showIndia: boolean
  currency: 'USD' | 'INR'
  fx: number
}>()

/** Bars are scaled against the largest cost drawn, so the shape is readable. */
const peak = computed(() =>
  Math.max(
    ...props.rows.flatMap((r) => [props.showUs ? r.us : 0, props.showIndia ? r.in : 0]),
    Number.EPSILON,
  ),
)

const usd = (n: number) => formatMoneyCompact(n, 'USD')
const ind = (n: number) =>
  props.currency === 'INR'
    ? formatMoneyCompact(n, 'INR', props.fx)
    : formatMoneyCompact(n, 'USD')

/**
 * The headline insight: graduated tiers mean cost grows slower than volume.
 * Compare the top step against the baseline on whichever panel is visible.
 */
const leverage = computed(() => {
  const base = props.rows[0]
  const top = props.rows[props.rows.length - 1]
  if (!base || !top || base === top) return null
  const region = props.showUs ? 'us' : 'in'
  const from = base[region]
  const to = top[region]
  if (from <= 0) return null
  const costMult = to / from
  if (costMult >= top.mult - 0.05) return null
  return { volumeMult: top.mult, costMult, region }
})

const blended = (costUsd: number, volume: number) =>
  volume > 0 ? (costUsd / volume) * 1000 : 0
</script>

<template>
  <section class="scale card">
    <div class="scale-head">
      <h3>How this scales</h3>
      <p class="tiny-text muted">
        The same SKU mix at multiples of today's volume. Google's tiers are graduated, so the
        blended rate falls as you grow — there is no ceiling where this stops estimating.
      </p>
    </div>

    <div class="table-wrap">
      <table class="num tiny-text">
        <thead>
          <tr>
            <th class="c-mult">Scale</th>
            <th class="c-vol">Monthly calls</th>
            <th v-if="showUs" class="c-cost">US</th>
            <th v-if="showIndia" class="c-cost">India</th>
            <th class="c-bar">Relative monthly cost</th>
            <th v-if="showUs" class="c-rate">US /1k</th>
            <th v-if="showIndia" class="c-rate">India /1k</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.mult" :class="{ base: row.mult === 1 }">
            <td class="c-mult">
              <span class="mult">{{ row.mult }}×</span>
              <span v-if="row.mult === 1" class="today tiny-text muted">today</span>
            </td>
            <td class="c-vol">{{ formatCompact(row.volume) }}</td>
            <td v-if="showUs" class="c-cost us">{{ usd(row.us) }}</td>
            <td v-if="showIndia" class="c-cost in">{{ ind(row.in) }}</td>
            <td class="c-bar">
              <div class="bars">
                <div v-if="showUs" class="bar">
                  <span
                    :style="{ width: `${(row.us / peak) * 100}%`, background: 'var(--us)' }"
                  />
                </div>
                <div v-if="showIndia" class="bar">
                  <span
                    :style="{ width: `${(row.in / peak) * 100}%`, background: 'var(--in)' }"
                  />
                </div>
              </div>
            </td>
            <td v-if="showUs" class="c-rate muted">
              {{ formatRate(blended(row.us, row.volume), 'USD') }}
            </td>
            <td v-if="showIndia" class="c-rate muted">
              {{
                currency === 'INR'
                  ? formatRate(blended(row.in, row.volume), 'INR', fx)
                  : formatRate(blended(row.in, row.volume), 'USD')
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="leverage" class="takeaway tiny-text">
      <strong>{{ leverage.volumeMult }}× the traffic costs only
        {{ leverage.costMult.toFixed(1) }}× as much</strong>
      <span class="muted">
        on the {{ leverage.region === 'us' ? 'US' : 'India' }} list — volume discounts absorb the
        rest.
      </span>
    </p>
  </section>
</template>

<style scoped>
.scale {
  padding: 15px 18px 16px;
}

.scale-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-2);
}

.scale-head p {
  margin: 4px 0 12px;
  max-width: 88ch;
  line-height: 1.5;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 620px;
}

th {
  text-align: right;
  color: var(--text-3);
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 10px;
  padding: 8px 12px 8px 0;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

th:first-child {
  padding-left: 14px;
}

td {
  text-align: right;
  padding: 9px 12px 9px 0;
  border-bottom: 1px solid var(--border);
}

td:first-child {
  padding-left: 14px;
}

tbody tr {
  transition: background 0.15s var(--ease);
}

tbody tr:hover {
  background: var(--surface-2);
}

tbody tr:last-child td {
  border-bottom: 0;
}

.base td {
  background: color-mix(in srgb, var(--accent) 4%, transparent);
}

.c-mult {
  text-align: left;
  width: 1%;
  white-space: nowrap;
}

.mult {
  font-weight: 700;
  font-size: 14px;
  letter-spacing: -0.02em;
}

.today {
  margin-left: 7px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
}

.c-cost {
  font-weight: 650;
  white-space: nowrap;
}

.c-cost.us {
  color: var(--us);
}

.c-cost.in {
  color: var(--in);
}

.c-bar {
  width: 34%;
  padding-right: 16px;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bars .bar {
  height: 5px;
  background: var(--surface-3);
}

.c-rate {
  white-space: nowrap;
}

.takeaway {
  margin: 12px 0 0;
  padding: 9px 13px;
  border-radius: var(--radius-sm);
  background: var(--good-soft);
  border: 1px solid color-mix(in srgb, var(--good) 20%, transparent);
  line-height: 1.5;
}

.takeaway strong {
  color: var(--good);
}
</style>
