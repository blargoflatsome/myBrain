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
      // CODING_STANDARDS §6: "+ New" buttons only on pages (*View.vue), in the PageHeading slot.
      'vue/no-restricted-syntax': ['error', { selector: "VElement[rawName='NewButton']", message: 'Put NewButton in the page’s PageHeading slot (a *View.vue file), not inside a component.' }],
      // CODING_STANDARDS §6: short choices are ChoiceChips; nothing draws its own chips.
      'no-restricted-imports': ['error', { paths: [{ name: '@/ui/styles', importNames: ['chip'], message: 'Use ChoiceChips (src/components/ChoiceChips.vue) for a short choice.' }] }],
    },
  },
  {
    files: ['src/**/*View.vue'],
    rules: { 'vue/no-restricted-syntax': 'off' },
  },
  {
    // CODING_STANDARDS §3 and §9: pages read my data through src/sync/useRows.ts, which hides deleted rows and
    // follows sign-in, never from the device database directly.
    files: ['src/**/*.vue'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "MemberExpression[object.name='brain'][property.name='db']", message: 'Read rows with useRows, useRow, useDeviceQuery, readRows or findRow (src/sync/useRows.ts).' },
        { selector: "ImportDeclaration[source.value='@/composables/useLiveQuery']", message: 'Read rows with useRows, useRow or useDeviceQuery (src/sync/useRows.ts).' },
        // CODING_STANDARDS §3: only actions say I finished something (after saving it), so nothing kept depends on a screen.
        { selector: "ImportDeclaration[source.value='@/celebrate/bus'] ImportSpecifier[imported.name='achieved']", message: 'Say it from the action that saves it (src/<feature>/actions.ts or the brain store), not from a screen.' },
      ],
    },
  },
  {
    // writing-tests skill "Make them deterministic": a fixed wait passes on a fast machine and fails on a busy one (a
    // 50 ms sleep failed CI on 2026-11-24). A wait for something that must NOT happen has no result to wait for, so it
    // may stay, with an eslint-disable-next-line comment giving that reason.
    files: ['src/tests/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.property.name='waitForTimeout']", message: 'Wait for the result instead: expect(...).toBeVisible(), expect.poll(...).' },
        { selector: "NewExpression[callee.name='Promise'] CallExpression[callee.name='setTimeout']", message: 'Wait for the result instead: vi.waitFor(() => expect(...)).' },
      ],
    },
  },
  {
    // The chip style itself, and the toggles and radios that aren't a choice of one value.
    files: ['src/components/ChoiceChips.vue', 'src/components/HowOften.vue', 'src/tasks/TasksView.vue'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // CODING_STANDARDS §6: an item type made in more than one place has one *Fields component. These files only hold
    // the frame (window, type chips, Save) and must not draw their own fields.
    files: [
      'src/tasks/components/TaskEditor.vue',
      'src/vault/components/VaultItemEditor.vue',
      'src/quests/components/QuestEditor.vue',
      'src/habits/components/HabitEditor.vue',
      'src/capture/components/CaptureForm.vue',
      'src/capture/components/DestinationPicker.vue',
      'src/postits/components/PostItBoard.vue',
    ],
    rules: {
      'vue/no-restricted-html-elements': [
        'error',
        { element: ['input', 'select', 'textarea', 'fieldset'], message: 'Use the item type’s *Fields component, TitleField, ChoiceChips or another shared field instead.' },
      ],
    },
  },
)
