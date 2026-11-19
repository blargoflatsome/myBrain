<template>
  <li :class="[card, 'gap-2']" data-testid="cheer-post" :data-kind="post.kind">
    <div class="flex items-start justify-between gap-2">
      <p class="min-w-0 flex-1 text-base [overflow-wrap:anywhere]" :class="post.kind === 'did_it' ? '' : 'font-semibold'" data-testid="cheer-text">{{ postText(post.kind, post.body) }}</p>
      <button
        v-if="!post.mine"
        type="button"
        :class="[rowDelete, '-my-1 -mr-1']"
        :aria-label="m.hide"
        :title="m.hide"
        data-testid="cheer-hide"
        @click="emit('hide', post)"
      >
        <AppIcon name="block" size="size-5" />
      </button>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p class="text-xs text-muted">
        <time :datetime="post.created_at">{{ agoLabel(post.created_at, now) }}</time>
        <template v-if="post.mine"> · {{ m.yourPost }}</template>
      </p>

      <!-- My own post: only I see the counts (SPEC §5 Cheers). -->
      <ul v-if="post.mine" class="flex flex-wrap gap-3 text-sm" :aria-label="m.reactionsLabel" data-testid="cheer-counts">
        <li v-for="r in REACTIONS" :key="r" class="flex items-center gap-1" :aria-label="m.countLabel(m.reactions[r]!, post[r] ?? 0)">
          <AppIcon :name="REACTION_ICONS[r]" size="size-5" />
          <span aria-hidden="true" class="tabular-nums">{{ post[r] ?? 0 }}</span>
        </li>
      </ul>
      <!-- Someone else's: one compact row. The one I sent is coloured and bolder, the rest fade; tapping mine takes it
           back, tapping another switches to it (SPEC §5 Cheers, Compact). -->
      <div v-else role="group" :aria-label="m.reactionsLabel" class="-my-1 -mr-1 flex">
        <button
          v-for="r in REACTIONS"
          :key="r"
          type="button"
          class="flex size-11 items-center justify-center rounded-xl hover:bg-bg"
          :class="post.my_reaction === r ? 'bg-accent/10 text-accent' : post.my_reaction ? 'text-muted' : 'text-ink'"
          :aria-label="m.reactions[r]"
          :aria-pressed="post.my_reaction === r"
          :title="m.reactions[r]"
          :aria-disabled="busy || undefined"
          :data-testid="`react-${r}`"
          @click="tap(r)"
        >
          <AppIcon :name="REACTION_ICONS[r]" size="size-5" :filled="post.my_reaction === r" :stroke-width="post.my_reaction === r ? 2.75 : 2" />
        </button>
      </div>
    </div>
  </li>
</template>

<script setup lang="ts">
// SPEC §5 Cheers: one anonymous post. Reactions are the only thing anyone can do; the block icon hides posts from
// this person (with Undo, in the page).
import AppIcon from '@/components/AppIcon.vue'
import type { CheerPost } from '@/cheers/cheers'
import { agoLabel, postText, REACTION_ICONS, REACTIONS, type Reaction } from '@/cheers/rules'
import { card, rowDelete } from '@/ui/styles'
import { messages } from '@/messages'

const props = defineProps<{ post: CheerPost; now: Date; busy: boolean }>()
const emit = defineEmits<{ react: [post: CheerPost, reaction: Reaction]; unreact: [post: CheerPost]; hide: [post: CheerPost] }>()
const m = messages.cheers
// Not disabled while sending: a disabled button drops keyboard focus (WCAG 2.4.3), so a tap then is just ignored.
function tap(r: Reaction) {
  if (props.busy) return
  if (props.post.my_reaction === r) emit('unreact', props.post)
  else emit('react', props.post, r)
}
</script>
