import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HomeView from './HomeView.vue'

vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('Spec §12: the app name is decided as "My Brain"', () => {
  it('shows the app name My Brain on the home screen', () => {
    setActivePinia(createPinia())
    const wrapper = mount(HomeView)
    expect(wrapper.get('h1').text()).toBe('My Brain')
  })
})
