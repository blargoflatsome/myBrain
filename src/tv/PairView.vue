<template>
  <main class="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pt-8 pb-28 md:px-8">
    <PageHeading :heading="m.pageHeading" :intro="m.pageHint" />
    <PairTvForm :initial-code="code" />
    <RouterLink to="/account" class="text-accent underline">{{ messages.accountGroups.devicesTitle }}</RouterLink>
  </main>
</template>

<script setup lang="ts">
// SPEC §9 Signing in by pairing: the TV's QR code opens /pair?code=… on my phone (after signing in if needed), with
// the code filled in, so approving it is one tap.
import { RouterLink, useRoute } from 'vue-router'
import PageHeading from '@/components/PageHeading.vue'
import PairTvForm from '@/tv/components/PairTvForm.vue'
import { cleanCode } from '@/tv/devices'
import { messages } from '@/messages'

const m = messages.pairedDevices
const code = cleanCode(String(useRoute().query.code ?? '')).slice(0, 12)
</script>
