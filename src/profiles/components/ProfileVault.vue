<template>
  <section v-if="buckets.length" class="flex flex-col gap-3" aria-labelledby="profile-vault-heading" data-testid="profile-vault">
    <h2 id="profile-vault-heading" class="text-lg font-semibold">{{ m.vaultHeading }}</h2>
    <MoreOptions v-for="b in buckets" :key="b.id" :title="b.name" :summary="m.itemCount(b.items.length)" test-id="profile-bucket">
      <p v-if="!b.items.length" class="text-muted">{{ m.vaultEmpty }}</p>
      <ul v-else class="flex flex-col gap-3">
        <li v-for="i in b.items" :key="i.id" class="flex flex-col gap-1" :class="b.checkable && i.checked ? 'text-muted' : ''" data-testid="profile-item">
          <p class="font-medium [overflow-wrap:anywhere]" :class="b.checkable && i.checked ? 'line-through' : ''">
            <span v-if="b.checkable && i.checked" class="sr-only">{{ vm.checkedLabel }} </span>{{ i.title }}
          </p>
          <span v-if="i.rating" class="text-sm text-star" :aria-label="vm.stars(i.rating)" role="img"><AppIcon v-for="n in 5" :key="n" name="star" :filled="n <= i.rating" :class="n <= i.rating ? '' : 'text-muted'" /></span>
          <RichNotes :value="i.notes" class="text-sm text-muted [overflow-wrap:anywhere]" />
          <a
            v-if="i.link"
            :href="linkTarget(i.link).href"
            target="_blank"
            rel="noopener noreferrer"
            class="self-start text-sm text-accent underline [overflow-wrap:anywhere]"
            :aria-label="`${linkTarget(i.link).kind === 'map' ? vm.openMap : vm.openLink}: ${linkLabel(i.link)}`"
          ><AppIcon :name="linkTarget(i.link).kind === 'map' ? 'pin' : 'link'" class="mr-1" />{{ linkLabel(i.link) }}</a>
        </li>
      </ul>
    </MoreOptions>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 The Vault, Shared Vaults / §5 Profiles: the buckets someone chose to show on their profile, read-only.
import AppIcon from '@/components/AppIcon.vue'
import MoreOptions from '@/components/MoreOptions.vue'
import RichNotes from '@/components/RichNotes.vue'
import type { ProfileBucket } from '@/profiles/profiles'
import { linkLabel, linkTarget } from '@/vault/rules'
import { messages } from '@/messages'

defineProps<{ buckets: ProfileBucket[] }>()
const m = messages.personProfile
const vm = messages.vault
</script>
