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
      'vue/max-attributes-per-line': 'off',
      // Coding standard (docs/CODING_STANDARDS.md): in a .vue file the template comes first, then the script.
      'vue/block-order': ['error', { order: ['template', 'script', 'style'] }],
    },
  },
)
