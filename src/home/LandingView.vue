<template>
  <div class="flex flex-col">
    <header class="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] md:px-8">
      <p class="text-lg font-bold">{{ messages.appName }}</p>
      <button type="button" :class="secondaryButton" :disabled="busy" data-testid="home-sign-in" @click="signIn">{{ m.signIn }}</button>
    </header>

    <main class="mx-auto flex w-full max-w-5xl flex-col gap-16 px-5 pt-10 pb-12 md:px-8">
      <p v-if="deleted" role="status" class="rounded-xl bg-surface p-3 text-ink">{{ messages.signIn.deleted }}</p>

      <section class="flex flex-col items-start gap-5 md:max-w-2xl" aria-labelledby="home-heading">
        <h1 id="home-heading" class="text-3xl font-bold leading-tight md:text-5xl">{{ m.heading }}</h1>
        <p class="text-lg text-muted">{{ m.body }}</p>
        <CreateAccount :busy="busy" @create="signIn" />
        <p v-if="failed" role="alert" class="text-danger">{{ messages.signIn.error }}</p>
        <DevSignIn v-if="DevSignIn" />
      </section>

      <section :aria-label="m.featuresLabel" class="flex flex-col gap-14">
        <article
          v-for="(f, i) in m.features"
          :key="f.image"
          class="flex flex-col items-center gap-6 md:flex-row md:gap-12"
          :class="i % 2 ? 'md:flex-row-reverse' : ''"
          data-testid="home-feature"
        >
          <div class="flex flex-col gap-2 md:flex-1">
            <h2 class="text-2xl font-bold">{{ f.title }}</h2>
            <p class="text-lg text-muted">{{ f.body }}</p>
          </div>
          <AppScreenshot :name="f.image" :alt="f.alt" />
        </article>
      </section>

      <section class="flex flex-col gap-3" aria-labelledby="home-extras">
        <h2 id="home-extras" class="text-2xl font-bold">{{ m.extrasHeading }}</h2>
        <ul class="flex flex-col gap-2 text-lg">
          <li v-for="x in m.extras" :key="x" class="flex items-start gap-3">
            <AppIcon name="check" class="mt-1 shrink-0 text-accent" />{{ x }}
          </li>
        </ul>
      </section>

      <section class="flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-6" aria-labelledby="home-end">
        <h2 id="home-end" class="text-2xl font-bold">{{ m.endHeading }}</h2>
        <p class="text-lg text-muted">{{ m.endBody }}</p>
        <CreateAccount :busy="busy" @create="signIn" />
      </section>

      <p class="flex flex-wrap justify-center gap-4 text-sm">
        <RouterLink to="/privacy" class="inline-flex min-h-6 items-center text-muted underline">{{ messages.legal.privacy }}</RouterLink>
        <RouterLink to="/terms" class="inline-flex min-h-6 items-center text-muted underline">{{ messages.legal.terms }}</RouterLink>
      </p>
    </main>
  </div>
</template>

<script setup lang="ts">
// SPEC §5 Home page: what signed-out visitors see at /. Two ways in, both Google sign-in (the first time creates the
// account): Sign in at the top, and Create a free account in the opening section and at the end.
import { defineAsyncComponent } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { messages } from '@/messages'
import { devSignInEnabled } from '@/auth/devSignIn'
import { useGoogleSignIn } from '@/auth/googleSignIn'
import AppIcon from '@/components/AppIcon.vue'
import AppScreenshot from '@/components/AppScreenshot.vue'
import CreateAccount from '@/home/CreateAccount.vue'
import { secondaryButton } from '@/ui/styles'

// Dev-only password sign-in for test accounts: only on the local dev server with VITE_DEV_SIGN_IN=true.
const DevSignIn = devSignInEnabled(import.meta.env) ? defineAsyncComponent(() => import('@/auth/components/DevSignIn.vue')) : null

const m = messages.home
const deleted = useRoute().query.deleted === '1'
const { failed, busy, signIn } = useGoogleSignIn()
</script>
