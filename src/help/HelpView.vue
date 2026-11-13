<template>
  <main class="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 pt-8 md:px-8 pb-28">
    <PageHeading :heading="m.heading" :intro="m.intro" />

    <nav id="help-topics" :aria-label="m.topicsLabel" class="scroll-mt-24" tabindex="-1">
      <ul class="flex flex-wrap gap-2">
        <li v-for="t in m.topics" :key="t.id">
          <a :href="`#${t.id}`" class="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-medium hover:bg-surface" @click.prevent="jump(t.id)">
            {{ t.title }}
          </a>
        </li>
      </ul>
    </nav>

    <section
      v-for="t in m.topics"
      :id="t.id"
      :key="t.id"
      class="flex scroll-mt-24 flex-col gap-4 border-t border-line pt-8 md:flex-row md:items-start md:gap-8"
      :aria-labelledby="`${t.id}-heading`"
      tabindex="-1"
      data-testid="help-topic"
    >
      <AppScreenshot :name="`help-${t.id}`" :alt="t.alt" class="mx-auto md:mx-0 md:w-56 md:shrink-0" />
      <div class="flex flex-col gap-3">
        <h2 :id="`${t.id}-heading`" class="text-xl font-bold">{{ t.title }}</h2>
        <p class="text-lg">{{ t.what }}</p>
        <ol class="flex flex-col gap-2">
          <li v-for="(step, i) in t.steps" :key="step" class="flex items-start gap-3">
            <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-ink" aria-hidden="true">{{ i + 1 }}</span>
            <span class="pt-0.5">{{ step }}</span>
          </li>
        </ol>
        <a href="#help-topics" class="inline-flex min-h-11 items-center self-start text-sm text-muted underline" @click.prevent="jump('help-topics')">{{ m.backToTopics }}</a>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Help: one short section per topic (a line on what it's for, a picture with what to tap, at most three
// steps), with topic links at the top. Written for short attention spans.
import { messages } from '@/messages'
import AppScreenshot from '@/components/AppScreenshot.vue'
import PageHeading from '@/components/PageHeading.vue'

const m = messages.help

/** Scroll to a topic and move focus there, so keyboard and screen reader users land on it too (WCAG 2.4.3). */
function jump(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
  history.replaceState(history.state, '', `#${id}`)
}
</script>
