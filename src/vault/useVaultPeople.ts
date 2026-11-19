// SPEC §5 Shared Vaults: names for "Shared by" and "Added by", read from the server when online. Kept for the visit,
// so the Vault page and its windows share one copy; offline, or for anyone who isn't a connection, it's "someone".
import { ref } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { messages } from '@/messages'
import { vaultPeople, type VaultPerson } from '@/vault/sharing'

const people = ref<VaultPerson[]>([])
const loadedFor = ref<string | null>(null)

export function useVaultPeople() {
  const brain = useBrainStore()
  if (loadedFor.value !== brain.userId) people.value = []

  async function load() {
    if (!brain.online || !brain.userId) return
    try {
      people.value = await vaultPeople()
      loadedFor.value = brain.userId
    } catch {
      // Names just fall back to "someone".
    }
  }
  const nameOf = (person: string | null | undefined) =>
    people.value.find((p) => p.person === person && p.display_name)?.display_name ?? messages.vault.someone
  const ownerName = (bucketId: string) => nameOf(people.value.find((p) => p.bucket_id === bucketId && p.is_owner)?.person)

  return { people, load, nameOf, ownerName }
}
