<template>
  <DashboardView v-if="auth.isSignedIn" />
  <LandingView v-else />
</template>

<script setup lang="ts">
// SPEC §5 Home page: `/` is the Dashboard when signed in and the marketing page when signed out.
import { defineAsyncComponent } from 'vue'
import DashboardView from '@/dashboard/DashboardView.vue'
import { useAuthStore } from '@/stores/auth'

const LandingView = defineAsyncComponent(() => import('@/home/LandingView.vue'))
const auth = useAuthStore()
</script>
