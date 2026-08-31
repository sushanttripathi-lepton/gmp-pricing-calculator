<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Sku } from '../lib/pricing'
import { GROUP_ORDER } from '../lib/pricing'
import { formatCompact, formatRate, parseVolume } from '../lib/format'

const props = defineProps<{
  skus: Sku[]
  volumes: Record<string, number>
  showLegacy: boolean
  showUs: boolean
  showIndia: boolean
}>()

const emit = defineEmits<{
  (e: 'set', id: string, volume: number): void
  (e: 'clear'): void
  (e: 'update:showLegacy', v: boolean): void
}>()

const query = ref('')
const collapsed = ref<Record<string, boolean>>({})
const searchEl = ref<HTMLInputElement | null>(null)

const QUICK = [10_000, 100_000, 1_000_000, 10_000_000]

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return props.skus.filter((s) => {
    if (s.legacy && !props.showLegacy) return false
    if (!q) return true
    return (
      s.name.toLowerCase().includes(q) ||
      s.group.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.us.sku.toLowerCase().includes(q) ||
      s.in.sku.toLowerCase().includes(q)
    )
  })
})

const sections = computed(() => {
  const byGroup = new Map<string, Sku[]>()
  for (const sku of filtered.value) {
    const key = sku.legacy ? `${sku.group} — Legacy` : sku.group
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key)!.push(sku)
  }
  return [...byGroup.entries()].sort((a, b) => {
    const rank = (k: string) => {
      const base = GROUP_ORDER.indexOf(k.replace(' — Legacy', '') as (typeof GROUP_ORDER)[number])
      return (base < 0 ? 99 : base) + (k.includes('Legacy') ? 100 : 0)
    }
    return rank(a[0]) - rank(b[0])
  })
})

const selectedCount = computed(() => props.skus.filter((s) => (props.volumes[s.id] ?? 0) > 0).length)

/** How many SKUs each group currently has volume on — shown as a group badge. */
const activeByGroup = computed(() => {
  const counts: Record<string, number> = {}
  for (const [group, items] of sections.value) {
    counts[group] = items.filter((s) => (props.volumes[s.id] ?? 0) > 0).length
  }
  return counts
})

/** Entry price per 1,000 — the first tier that actually costs something. */
function startingRate(sku: Sku, region: 'us' | 'in') {
  const p = sku[region]
  if (p.freeCap === null) return null
  return p.tiers[0]?.per1000 ?? 0
}

/** Only the caps for the panels that are actually on screen. */
function freeCaps(sku: Sku) {
  const caps: string[] = []
  if (props.showUs) caps.push(formatCompact(sku.us.freeCap ?? 0))
  if (props.showIndia) caps.push(formatCompact(sku.in.freeCap ?? 0))
  return caps.join(' / ')
}

const draft = ref<Record<string, string>>({})

function display(sku: Sku) {
  if (draft.value[sku.id] !== undefined) return draft.value[sku.id]
  const v = props.volumes[sku.id] ?? 0
  return v ? v.toLocaleString('en-US') : ''
}

function onInput(sku: Sku, value: string) {
  draft.value[sku.id] = value
  const parsed = parseVolume(value)
  if (!Number.isNaN(parsed)) emit('set', sku.id, parsed)
}

function onBlur(sku: Sku) {
  delete draft.value[sku.id]
}

function bump(sku: Sku, value: number) {
  delete draft.value[sku.id]
  emit('set', sku.id, value)
}

function toggle(key: string) {
  collapsed.value[key] = !collapsed.value[key]
}

function focusSearch() {
  searchEl.value?.focus()
  searchEl.value?.select()
}

defineExpose({ focusSearch })
</script>

<template>
  <section class="editor card">
    <header class="editor-head">
      <div class="row search-row">
        <input
          ref="searchEl"
          v-model="query"
          class="field search"
          type="search"
          aria-label="Search SKUs"
          :placeholder="`Search ${skus.length} SKUs — e.g. geocoding, dynamic maps, routes…`"
          @keydown.esc="query = ''"
        />
        <kbd v-show="!query" class="slash" aria-hidden="true">/</kbd>
      </div>

      <div class="row meta">
        <span class="muted tiny-text">
          {{ selectedCount }} SKU{{ selectedCount === 1 ? '' : 's' }} with volume
        </span>
        <span class="spacer" />
        <label class="check tiny-text">
          <input
            type="checkbox"
            :checked="showLegacy"
            @change="emit('update:showLegacy', ($event.target as HTMLInputElement).checked)"
          />
          Show legacy SKUs
        </label>
        <button class="btn tiny" :disabled="!selectedCount" @click="emit('clear')">Clear all</button>
      </div>

    </header>

    <div class="list scroll">
      <div v-for="[group, items] in sections" :key="group" class="group">
        <button class="group-head" :aria-expanded="!collapsed[group]" @click="toggle(group)">
          <span class="chev" :class="{ open: !collapsed[group] }" aria-hidden="true">▸</span>
          <span class="group-name">{{ group }}</span>
          <span v-if="activeByGroup[group]" class="group-active num">
            {{ activeByGroup[group] }}
          </span>
          <span class="muted tiny-text">{{ items.length }}</span>
        </button>

        <div v-show="!collapsed[group]">
          <div
            v-for="sku in items"
            :key="sku.id"
            class="sku"
            :class="{ active: (volumes[sku.id] ?? 0) > 0 }"
          >
            <div class="sku-main">
              <div class="sku-name">
                {{ sku.name }}
                <span class="badge" :class="sku.category.toLowerCase()">{{ sku.category }}</span>
                <span v-if="sku.legacy" class="badge legacy">Legacy</span>
              </div>
              <div class="sku-rates tiny-text num">
                <template v-if="startingRate(sku, 'us') === null">
                  <span class="free">Free · unlimited</span>
                </template>
                <template v-else>
                  <span v-if="showUs" class="rate us">
                    US {{ formatRate(startingRate(sku, 'us')!, 'USD') }}
                  </span>
                  <span v-if="showIndia" class="rate in">
                    IN {{ formatRate(startingRate(sku, 'in')!, 'USD') }}
                  </span>
                  <span class="muted">free {{ freeCaps(sku) }}</span>
                </template>
              </div>
            </div>

            <div class="sku-input">
              <input
                class="field vol num"
                inputmode="numeric"
                placeholder="0"
                :aria-label="`Monthly ${sku.unit} for ${sku.name}`"
                :value="display(sku)"
                @input="onInput(sku, ($event.target as HTMLInputElement).value)"
                @blur="onBlur(sku)"
              />
              <div class="quick">
                <button
                  v-for="q in QUICK"
                  :key="q"
                  class="btn tiny"
                  :title="`Set ${q.toLocaleString()} calls/month`"
                  @click="bump(sku, q)"
                >
                  {{ formatCompact(q) }}
                </button>
                <button
                  v-if="(volumes[sku.id] ?? 0) > 0"
                  class="btn tiny clear"
                  :title="`Clear ${sku.name}`"
                  @click="bump(sku, 0)"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p v-if="!sections.length" class="empty muted">No SKUs match “{{ query }}”.</p>
    </div>
  </section>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.editor-head {
  padding: 13px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta {
  flex-wrap: wrap;
}

.spacer {
  flex: 1;
}

.search-row {
  position: relative;
}

.search {
  width: 100%;
  padding-right: 34px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.search:focus {
  background: var(--surface);
}

.search::-webkit-search-cancel-button {
  cursor: pointer;
}

/* Hints the "/" shortcut without stealing a click target. */
.slash {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  color: var(--text-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 5px;
  box-shadow: var(--shadow-sm);
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
  cursor: pointer;
  user-select: none;
}

.check input {
  accent-color: var(--accent);
}

/* ------------------------------------------------------------- SKU list */

.list {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.group-head {
  position: sticky;
  top: 0;
  z-index: 1;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 14px;
  background: color-mix(in srgb, var(--surface-2) 92%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 0;
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-2);
  transition: color 0.15s var(--ease);
}

.group-head:hover {
  color: var(--text);
}

.chev {
  display: inline-block;
  font-size: 10px;
  color: var(--text-3);
  transition: transform 0.2s var(--ease);
}

.chev.open {
  transform: rotate(90deg);
}

.group-name {
  flex: 1;
}

/* How many SKUs in this group are already priced — survives collapsing. */
.group-active {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--sel);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
}

.sku {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  transition: background 0.15s var(--ease), box-shadow 0.15s var(--ease);
}

.sku:hover {
  background: var(--surface-2);
}

/* Selection uses its own hue: blue and amber already mean US and India here. */
.sku.active {
  background: color-mix(in srgb, var(--sel) 6%, transparent);
  box-shadow: inset 3px 0 0 var(--sel);
}

.sku.active:hover {
  background: color-mix(in srgb, var(--sel) 10%, transparent);
}

.sku-main {
  flex: 1;
  min-width: 0;
}

.sku-name {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-weight: 550;
  letter-spacing: -0.005em;
}

.sku-rates {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 3px;
  color: var(--text-2);
}

.rate.us {
  color: var(--us);
  font-weight: 550;
}

.rate.in {
  color: var(--in);
  font-weight: 550;
}

.free {
  color: var(--good);
  font-weight: 650;
}

.sku-input {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}

.vol {
  width: 132px;
  text-align: right;
  font-weight: 600;
}

.quick {
  display: flex;
  gap: 3px;
}

.clear:hover {
  border-color: var(--bad);
  color: var(--bad);
  background: var(--bad-soft);
}

.empty {
  padding: 32px 24px;
  text-align: center;
}

/* On narrow screens the two-column row collapses; the input goes full width so
   the quick-set buttons stay tappable instead of squeezing to slivers. */
@media (max-width: 560px) {
  .sku {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .sku-input {
    align-items: stretch;
  }

  .vol {
    width: 100%;
  }

  .quick {
    justify-content: flex-end;
  }

  .quick .btn {
    flex: 1;
  }
}
</style>
