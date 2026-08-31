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
</script>

<template>
  <section class="editor card">
    <header class="editor-head">
      <div class="row">
        <input
          v-model="query"
          class="field search"
          type="search"
          placeholder="Search 74 SKUs — e.g. geocoding, dynamic maps, routes…"
        />
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
        <button class="group-head" @click="toggle(group)">
          <span class="chev" :class="{ open: !collapsed[group] }">▸</span>
          <span class="group-name">{{ group }}</span>
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
                  class="btn tiny"
                  title="Clear"
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
  padding: 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.search {
  width: 100%;
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-2);
  cursor: pointer;
}

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
  gap: 8px;
  padding: 8px 12px;
  background: var(--surface-2);
  border: 0;
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-2);
}

.chev {
  display: inline-block;
  transition: transform 0.15s;
}

.chev.open {
  transform: rotate(90deg);
}

.group-name {
  flex: 1;
}

.sku {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
}

.sku.active {
  background: color-mix(in srgb, var(--accent) 5%, transparent);
  box-shadow: inset 3px 0 0 var(--accent);
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
  font-weight: 500;
}

.sku-rates {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 2px;
  color: var(--text-2);
}

.rate.us {
  color: var(--us);
}

.rate.in {
  color: var(--in);
}

.free {
  color: var(--good);
  font-weight: 600;
}

.sku-input {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.vol {
  width: 130px;
  text-align: right;
}

.quick {
  display: flex;
  gap: 3px;
}

.empty {
  padding: 24px;
  text-align: center;
}
</style>
