import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HomeView from './HomeView.vue'

describe('Spec §12: the app name is decided as "My Brain"', () => {
  it('shows the app name My Brain on the home screen', () => {
    const wrapper = mount(HomeView)
    expect(wrapper.get('h1').text()).toBe('My Brain')
  })
})
