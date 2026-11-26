<template>
  <section class="flex flex-col gap-4 rounded-xl border border-line p-4" aria-labelledby="paired-devices" data-testid="paired-devices">
    <div>
      <h3 id="paired-devices" class="font-semibold">{{ m.heading }}</h3>
      <p class="text-sm text-muted">{{ m.hint }}</p>
    </div>
    <PairTvForm @paired="devices.reload" />
    <ListFailed v-if="devices.state.value === 'failed'" @retry="devices.reload" />
    <p v-else-if="devices.state.value === 'ready' && !shown.length" class="text-sm text-muted">{{ m.none }}</p>
    <ul v-if="shown.length" class="flex flex-col gap-2">
      <template v-for="{ key, row: d, line } in shown" :key="key">
        <UndoLine v-if="line" :line="line" in-box class="!pl-0" @undo="(el) => undoable.run(line, el)" />
        <li v-else-if="d" class="flex min-w-0 flex-wrap items-center justify-between gap-2" data-testid="paired-device">
          <span class="min-w-0 text-sm">
            <span class="block font-medium">{{ m.device(d.name, dayOfLabel(d.created_at)) }}</span>
            <span class="block text-muted">{{ d.last_seen_at ? m.lastSeen(momentLabel(d.last_seen_at)) : m.neverSeen }}</span>
          </span>
          <button type="button" :class="smallButton" :aria-label="m.unpairLabel(d.name, dayOfLabel(d.created_at))" @click="unpair(d)">{{ m.unpair }}</button>
        </li>
      </template>
    </ul>
    <p v-if="failure" class="text-sm text-danger" role="alert">{{ failure }}</p>
  </section>
</template>

<script setup lang="ts">
// SPEC §9 Signing in by pairing: the Account page lists my paired TVs, when each was last seen, and Unpair, which
// works straight away with Undo in place (SPEC §2). The list comes from the server (SPEC §7 Lists from the server).
import { computed, ref } from 'vue'
import ListFailed from '@/components/ListFailed.vue'
import UndoLine from '@/components/UndoLine.vue'
import PairTvForm from '@/tv/components/PairTvForm.vue'
import { useServerList } from '@/server/useServerList'
import { useUndoInPlace } from '@/composables/useUndoInPlace'
import { myPairedDevices, unpairDevice, type PairedDevice } from '@/tv/devices'
import { sayWhy } from '@/server/server'
import { dayOfLabel, momentLabel } from '@/ui/dates'
import { messages } from '@/messages'
import { smallButton } from '@/ui/styles'

const m = messages.pairedDevices
const devices = useServerList(myPairedDevices, [] as PairedDevice[])
const undoable = useUndoInPlace()
const shown = computed(() => undoable.placed(devices.value.value))
const failure = ref('')

async function unpair(d: PairedDevice) {
  failure.value = ''
  const place = { row: { id: d.id, in: devices.value.value } }
  try {
    await unpairDevice(d.id)
  } catch (err) {
    failure.value = sayWhy(err, { offline: m.offline, limit: m.failed, failed: m.failed })
    return
  }
  devices.value.value = devices.value.value.filter((x) => x.id !== d.id)
  undoable.offer(m.unpaired(d.name), async () => {
    await unpairDevice(d.id, true)
    await devices.reload()
  }, place)
}
</script>
