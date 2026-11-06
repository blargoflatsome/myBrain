import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'

export default defineConfigWithVueTs(
  { ignores: ['dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**', '.netlify/**'] },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  {
    rules: {
      // Formatting rules that fight short one-line elements; layout is left to the author.
      'vue/singleline-html-element-content-newline': 'off',
    },
  },
)
