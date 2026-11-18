<template>
  <li :class="[card, 'gap-2']" data-testid="cheer-post" :data-kind="post.kind">
    <div class="flex items-start justify-between gap-2">
      <p class="min-w-0 flex-1 text-base [overflow-wrap:anywhere]" :class="post.kind === 'did_it' ? '' : 'font-semibold'" data-testid="cheer-text">{{ postText(post.kind, post.body) }}</p>
      <button
        v-if="!post.mine"
        type="button"
        :class="rowDelete"
        :aria-label="m.more"
        :aria-expanded="moreOpen"
        :aria-controls="moreId"
        data-testid="cheer-more"
        @click="moreOpen = !moreOpen"
      >
        <AppIcon name="more" size="size-5" />
      </button>
    </div>
    <div v-if="moreOpen && !post.mine" :id="moreId">
      <button type="button" :class="smallButton" data-testid="cheer-hide" @click="emit('hide', post)">{{ m.hide }}</button>
    </div>
    <p class="text-xs text-muted">
      <time :datetime="post.created_at">{{ agoLabel(post.created_at, now) }}</time>
      <template v-if="post.mine"> · {{ m.yourPost }}</template>
    </p>

    <!-- My own post: only I see the counts (SPEC §5 Cheers). -->
    <ul v-if="post.mine" class="flex flex-wrap gap-3 text-sm" :aria-label="m.reactionsLabel" data-testid="cheer-counts">
      <li v-if="!total" class="text-muted">{{ m.nobodyYet }}</li>
      <template v-else>
        <li v-for="r in REACTIONS" :key="r" class="flex items-center gap-1" :aria-label="m.countLabel(m.reactions[r]!, post[r] ?? 0)">
          <AppIcon :name="REACTION_ICONS[r]" size="size-5" />
          <span aria-hidden="true" class="tabular-nums">{{ post[r] ?? 0 }}</span>
        </li>
      </template>
    </ul>
    <!-- Someone else's: the one I picked, or the four to pick from. -->
    <p v-else-if="post.my_reaction" class="flex items-center gap-1.5 text-sm text-muted" data-testid="cheer-sent">
      <AppIcon :name="REACTION_ICONS[post.my_reaction]" size="size-5" />
      {{ m.youSent(m.reactions[post.my_reaction]!) }}
    </p>
    <div v-else role="group" :aria-label="m.reactionsLabel" class="flex flex-wrap gap-2">
      <button
        v-for="r in REACTIONS"
        :key="r"
        type="button"
        :class="rowAction"
        :aria-label="m.reactWith(m.reactions[r]!)"
        :title="m.reactions[r]"
        :disabled="busy"
        :data-testid="`react-${r}`"
        @click="emit('react', post, r)"
      >
        <AppIcon :name="REACTION_ICONS[r]" size="size-5" />
      </button>
    </div>
  </li>
</template>

<script setup lang="ts">
// SPEC §5 Cheers: one anonymous post. Reactions are the only thing anyone can do; the ⋯ shows Hide posts from this
// person (a disclosure: one action doesn't need a menu).
import { computed, ref, useId } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import type { CheerPost } from '@/cheers/cheers'
import { agoLabel, postText, REACTION_ICONS, REACTIONS, type Reaction } from '@/cheers/rules'
import { card, rowAction, rowDelete, smallButton } from '@/ui/styles'
import { messages } from '@/messages'

const props = defineProps<{ post: CheerPost; now: Date; busy: boolean }>()
const emit = defineEmits<{ react: [post: CheerPost, reaction: Reaction]; hide: [post: CheerPost] }>()
const m = messages.cheers
const moreOpen = ref(false)
const moreId = useId()
const total = computed(() => REACTIONS.reduce((sum, r) => sum + (props.post[r] ?? 0), 0))
</script>
