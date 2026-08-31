<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import UsageEditor from './components/UsageEditor.vue'
import RegionPanel from './components/RegionPanel.vue'
import ScaleProjection from './components/ScaleProjection.vue'
import type { ProjectionRow } from './components/ScaleProjection.vue'
import { catalog, costFor, totalFor } from './lib/pricing'
import type { Sku } from './lib/pricing'
import { formatInt } from './lib/format'

const skus = catalog.skus as Sku[]
const bySkuCode = new Map(skus.map((s) => [s.us.sku, s]))

const volumes = ref<Record<string, number>>({})
const fx = ref(88)
const applyFreeCap = ref(true)
const showLegacy = ref(false)
const indiaCurrency = ref<'INR' | 'USD'>('INR')
const showUs = ref(true)
const showIndia = ref(true)
const theme = ref<'light' | 'dark' | 'system'>('system')
const copied = ref(false)
const editor = ref<InstanceType<typeof UsageEditor> | null>(null)

/* ---------------------------------------------------------------- state io */

function readUrl() {
  const p = new URLSearchParams(location.search)
  const v = p.get('v')
  if (v) {
    const next: Record<string, number> = {}
    for (const pair of v.split(',')) {
      const [code, amount] = pair.split(':')
      const sku = bySkuCode.get(code)
      const n = Number(amount)
      if (sku && Number.isFinite(n) && n > 0) next[sku.id] = n
    }
    volumes.value = next
  }
  const rate = Number(p.get('fx'))
  if (Number.isFinite(rate) && rate > 0) fx.value = rate
  if (p.get('free') === '0') applyFreeCap.value = false
  if (p.get('legacy') === '1') showLegacy.value = true
  if (p.get('cur') === 'USD') indiaCurrency.value = 'USD'
  if (p.get('hide') === 'us') showUs.value = false
  if (p.get('hide') === 'in') showIndia.value = false
}

function shareUrl() {
  const v = Object.entries(volumes.value)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${skus.find((s) => s.id === id)!.us.sku}:${n}`)
    .join(',')
  const p = new URLSearchParams()
  if (v) p.set('v', v)
  p.set('fx', String(fx.value))
  if (!applyFreeCap.value) p.set('free', '0')
  if (showLegacy.value) p.set('legacy', '1')
  if (indiaCurrency.value === 'USD') p.set('cur', 'USD')
  if (!showUs.value) p.set('hide', 'us')
  else if (!showIndia.value) p.set('hide', 'in')
  return `${location.origin}${location.pathname}?${p.toString()}`
}

function syncUrl() {
  history.replaceState(null, '', shareUrl())
}

async function copyLink() {
  const url = shareUrl()
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    // Clipboard API needs a secure context; fall back to a selection copy so
    // the button still does something useful over plain http.
    const ta = document.createElement('textarea')
    ta.value = url
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 1600)
}

/* -------------------------------------------------------------- theming */

function applyTheme() {
  const root = document.documentElement
  if (theme.value === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme.value)
  localStorage.setItem('gmp-calc-theme', theme.value)
}

function cycleTheme() {
  theme.value = theme.value === 'system' ? 'light' : theme.value === 'light' ? 'dark' : 'system'
}

const themeLabel = computed(() =>
  theme.value === 'system' ? 'System theme' : theme.value === 'light' ? 'Light theme' : 'Dark theme',
)

/* ---------------------------------------------------------------- totals */

const usTotals = computed(() => totalFor(skus, volumes.value, 'us', applyFreeCap.value))
const inTotals = computed(() => totalFor(skus, volumes.value, 'in', applyFreeCap.value))

const savings = computed(() => {
  const us = usTotals.value.total
  const india = inTotals.value.total
  if (us <= 0 && india <= 0) return null
  return { abs: us - india, pct: us > 0 ? ((us - india) / us) * 100 : 0 }
})

/**
 * Pin a ramp colour to each of the biggest-spending SKUs, ranked by whichever
 * region charges more for it. Both panels read from this one map, so a SKU
 * keeps its colour across the comparison even when the panels rank it
 * differently — which they routinely do, since the two lists tier differently.
 */
const RAMP = 6

const compositionColors = computed(() => {
  const peak = new Map<string, number>()
  for (const line of [...usTotals.value.lines, ...inTotals.value.lines]) {
    if (line.result.cost <= 0) continue
    peak.set(line.sku.id, Math.max(peak.get(line.sku.id) ?? 0, line.result.cost))
  }
  const map: Record<string, string> = {}
  ;[...peak.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, RAMP)
    .forEach(([id], i) => (map[id] = `var(--c${i + 1})`))
  return map
})

/**
 * Re-price the whole mix at multiples of the entered volume. Cheap enough to do
 * on every keystroke, and it is the only place the graduated tiers become
 * visible as a trend rather than a single point.
 */
const SCALE_STEPS = [1, 2, 5, 10, 25]

const projection = computed<ProjectionRow[]>(() => {
  if (!usTotals.value.volume) return []
  return SCALE_STEPS.map((mult) => {
    const scaled: Record<string, number> = {}
    for (const [id, n] of Object.entries(volumes.value)) scaled[id] = n * mult
    const us = totalFor(skus, scaled, 'us', applyFreeCap.value)
    const ind = totalFor(skus, scaled, 'in', applyFreeCap.value)
    return { mult, volume: us.volume, us: us.total, in: ind.total }
  })
})

/* --------------------------------------------------------------- actions */

function setVolume(id: string, volume: number) {
  if (volume > 0) volumes.value = { ...volumes.value, [id]: volume }
  else {
    const next = { ...volumes.value }
    delete next[id]
    volumes.value = next
  }
}

function clearAll() {
  volumes.value = {}
}

/** "/" jumps to search the way it does in most dense tools. */
function onKeydown(e: KeyboardEvent) {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
  const el = e.target as HTMLElement | null
  if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
  if (el?.isContentEditable) return
  e.preventDefault()
  editor.value?.focusSearch()
}

function exportCsv() {
  const head = [
    'SKU name',
    'Group',
    'Category',
    'Legacy',
    'Monthly calls',
    'US SKU',
    'US free calls',
    'US billable',
    'US cost (USD)',
    'India SKU',
    'India free calls',
    'India billable',
    'India cost (USD)',
    `India cost (INR @ ${fx.value})`,
  ]
  const rows = skus
    .filter((s) => (volumes.value[s.id] ?? 0) > 0)
    .map((s) => {
      const v = volumes.value[s.id]
      const u = costFor(s.us, v, applyFreeCap.value)
      const i = costFor(s.in, v, applyFreeCap.value)
      return [
        s.name,
        s.group,
        s.category,
        s.legacy ? 'yes' : 'no',
        v,
        s.us.sku,
        u.freeEvents,
        u.billable,
        u.cost.toFixed(2),
        s.in.sku,
        i.freeEvents,
        i.billable,
        i.cost.toFixed(2),
        (i.cost * fx.value).toFixed(2),
      ]
    })
  rows.push([
    'TOTAL',
    '',
    '',
    '',
    usTotals.value.volume,
    '',
    usTotals.value.freeEvents,
    usTotals.value.billable,
    usTotals.value.total.toFixed(2),
    '',
    inTotals.value.freeEvents,
    inTotals.value.billable,
    inTotals.value.total.toFixed(2),
    (inTotals.value.total * fx.value).toFixed(2),
  ])

  const csv = [head, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'google-maps-platform-estimate.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------- lifecycle */

onMounted(() => {
  const saved = localStorage.getItem('gmp-calc-theme') as typeof theme.value | null
  if (saved) theme.value = saved
  applyTheme()
  readUrl()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

watch(theme, applyTheme)
watch([volumes, fx, applyFreeCap, showLegacy, indiaCurrency, showUs, showIndia], syncUrl, {
  deep: true,
})
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="logo" aria-hidden="true">🗺️</span>
        <div>
          <h1>Google Maps Platform pricing calculator</h1>
          <p class="tiny-text muted">
            US (global) vs India list pricing · no volume ceiling
          </p>
        </div>
      </div>

      <div class="topbar-actions">
        <button class="btn icon" :aria-label="`${themeLabel} — click to change`" @click="cycleTheme">
          <span aria-hidden="true">
            {{ theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🖥️' }}
          </span>
        </button>
        <button class="btn" :disabled="!usTotals.lines.length" @click="exportCsv">Export CSV</button>
        <button class="btn primary" @click="copyLink">{{ copied ? 'Copied ✓' : 'Copy link' }}</button>
        <span class="sr-only" role="status" aria-live="polite">
          {{ copied ? 'Shareable link copied to clipboard' : '' }}
        </span>
      </div>
    </header>

    <div class="controls card">
      <div class="ctl">
        <span class="ctl-label" id="fx-label">USD → INR</span>
        <input
          v-model.number="fx"
          class="field fx num"
          type="number"
          min="1"
          step="0.01"
          aria-labelledby="fx-label"
        />
        <span class="tiny-text muted hint">
          Google publishes both price lists in USD and bills India accounts in INR at its own
          conversion rate — set yours here.
        </span>
      </div>

      <div v-if="showIndia" class="ctl">
        <span class="ctl-label">India panel shows</span>
        <div class="seg" role="group" aria-label="India panel currency">
          <button
            class="seg-btn"
            :class="{ on: indiaCurrency === 'INR' }"
            :aria-pressed="indiaCurrency === 'INR'"
            @click="indiaCurrency = 'INR'"
          >
            ₹ INR
          </button>
          <button
            class="seg-btn"
            :class="{ on: indiaCurrency === 'USD' }"
            :aria-pressed="indiaCurrency === 'USD'"
            @click="indiaCurrency = 'USD'"
          >
            $ USD
          </button>
        </div>
      </div>

      <div class="ctl">
        <label class="check">
          <input v-model="applyFreeCap" type="checkbox" />
          Apply free monthly caps
        </label>
      </div>

      <div class="ctl">
        <span class="ctl-label">Panels</span>
        <label
          class="check"
          :title="!showIndia ? 'At least one panel has to stay visible' : 'Show the US panel'"
        >
          <input v-model="showUs" type="checkbox" :disabled="!showIndia" />
          US
        </label>
        <label
          class="check"
          :title="!showUs ? 'At least one panel has to stay visible' : 'Show the India panel'"
        >
          <input v-model="showIndia" type="checkbox" :disabled="!showUs" />
          India
        </label>
      </div>
    </div>

    <main class="layout">
      <UsageEditor
        ref="editor"
        class="col-editor"
        :skus="skus"
        :volumes="volumes"
        :show-legacy="showLegacy"
        :show-us="showUs"
        :show-india="showIndia"
        @set="setVolume"
        @clear="clearAll"
        @update:show-legacy="showLegacy = $event"
      />

      <div class="col-results" :class="{ single: !showUs || !showIndia }">
        <RegionPanel
          v-if="showUs"
          title="United States / global pricing"
          note="Standard Google Maps Platform price list, billed in USD."
          accent="us"
          currency="USD"
          :fx="1"
          :totals="usTotals"
          :compare-usd="showIndia ? inTotals.total || null : null"
          :colors="compositionColors"
          :source-url="catalog.sources.us"
        />
        <RegionPanel
          v-if="showIndia"
          title="India pricing"
          :note="
            indiaCurrency === 'INR'
              ? `India price list, converted at ₹${fx} per USD.`
              : 'India price list, shown at Google’s published USD rates.'
          "
          accent="in"
          :currency="indiaCurrency"
          :fx="indiaCurrency === 'INR' ? fx : 1"
          :totals="inTotals"
          :compare-usd="showUs ? usTotals.total || null : null"
          :colors="compositionColors"
          :source-url="catalog.sources.in"
        />
      </div>
    </main>

    <section v-if="savings && showUs && showIndia" class="summary card">
      <div class="summary-main">
        <strong>India list pricing is
          {{ savings.abs >= 0 ? 'lower' : 'higher' }} by
          {{ Math.abs(savings.pct).toFixed(1) }}%</strong>
        <span class="muted">
          ({{ savings.abs >= 0 ? '−' : '+' }}${{
            Math.abs(savings.abs).toLocaleString('en-US', { maximumFractionDigits: 2 })
          }}/month on {{ formatInt(usTotals.volume) }} calls)
        </span>
      </div>
      <p class="tiny-text muted">
        India pricing applies only to accounts with billing and a large majority of usage in India,
        and those accounts cannot use subscription plans. India also gets larger free caps
        (70K / 35K / 7K calls per SKU per month vs 10K / 5K / 1K) but only two volume tiers instead
        of five.
      </p>
    </section>

    <ScaleProjection
      v-if="projection.length"
      :rows="projection"
      :show-us="showUs"
      :show-india="showIndia"
      :currency="indiaCurrency"
      :fx="indiaCurrency === 'INR' ? fx : 1"
    />

    <footer class="foot">
      <p class="tiny-text muted">
        Rates parsed from Google's published price lists on {{ catalog.generatedAt }} —
        <a :href="catalog.sources.us" target="_blank" rel="noopener">global list</a> ·
        <a :href="catalog.sources.in" target="_blank" rel="noopener">India list</a>. Volume discounts
        are applied on a graduated basis: calls falling in each tier are billed at that tier's rate.
        Estimates cover core-service SKUs only — they exclude taxes, subscriptions, negotiated
        discounts, and non-core products. Not affiliated with Google.
      </p>
    </footer>
  </div>
</template>

<style scoped>
.app {
  max-width: 1720px;
  margin: 0 auto;
  padding: 0 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100vh;
}

/* Frosted and pinned: the totals stay reachable while the SKU list scrolls. */
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 2px 12px;
  margin-bottom: -2px;
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s var(--ease);
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  flex: 1;
  min-width: 260px;
}

.logo {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  font-size: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

h1 {
  margin: 0;
  font-size: 17px;
  font-weight: 680;
  letter-spacing: -0.02em;
}

.brand p {
  margin: 1px 0 0;
}

.topbar-actions {
  display: flex;
  gap: 8px;
}

.icon {
  padding: 7px 10px;
}

/* --------------------------------------------------------------- controls */

.controls {
  display: flex;
  gap: 0;
  align-items: stretch;
  flex-wrap: wrap;
  padding: 0;
  overflow: hidden;
}

/* Hairline dividers instead of loose gaps — reads as one instrument panel. */
.ctl {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
  padding: 11px 16px;
  border-right: 1px solid var(--border);
}

.ctl:last-child {
  border-right: 0;
}

.ctl-label {
  font-size: 11px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-3);
}

.fx {
  width: 88px;
  text-align: right;
  font-weight: 600;
}

.hint {
  max-width: 290px;
  line-height: 1.4;
}

.seg {
  display: inline-flex;
  padding: 2px;
  gap: 2px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.seg-btn {
  padding: 5px 13px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
  transition: background 0.18s var(--ease), color 0.18s var(--ease),
    box-shadow 0.18s var(--ease);
}

.seg-btn:hover:not(.on) {
  color: var(--text);
}

.seg-btn.on {
  background: var(--raised);
  color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.check input {
  accent-color: var(--accent);
  width: 15px;
  height: 15px;
}

.check:has(input:disabled) {
  cursor: not-allowed;
  color: var(--text-3);
}

/* ----------------------------------------------------------------- layout */

.layout {
  display: grid;
  grid-template-columns: minmax(380px, 460px) minmax(0, 1fr);
  gap: 14px;
  align-items: stretch;
  min-height: 0;
  flex: 1;
}

.col-editor {
  max-height: calc(100vh - 96px);
  position: sticky;
  top: 82px;
}

.col-results {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  min-height: 0;
}

.col-results.single {
  grid-template-columns: minmax(0, 1fr);
}

.col-results > * {
  max-height: calc(100vh - 96px);
}

/* ---------------------------------------------------------------- summary */

.summary {
  padding: 14px 18px;
  border-left: 3px solid var(--good);
}

.summary-main {
  display: flex;
  gap: 9px;
  align-items: baseline;
  flex-wrap: wrap;
  margin-bottom: 5px;
  font-size: 15px;
  letter-spacing: -0.01em;
}

.summary p {
  margin: 0;
  max-width: 110ch;
}

.foot {
  padding: 2px 4px 18px;
}

.foot p {
  margin: 0;
  max-width: 100ch;
}

@media (max-width: 1240px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .col-editor {
    position: static;
    max-height: 60vh;
  }

  .col-results > * {
    max-height: none;
  }
}

@media (max-width: 800px) {
  .col-results {
    grid-template-columns: 1fr;
  }

  .ctl {
    border-right: 0;
    border-bottom: 1px solid var(--border);
    width: 100%;
  }

  .ctl:last-child {
    border-bottom: 0;
  }

  .hint {
    max-width: none;
  }
}
</style>
