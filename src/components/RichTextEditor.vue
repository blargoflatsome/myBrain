<script setup lang="ts">
// SPEC §5 Journal: a formatted-text editor (bold, italic, underline, strikethrough, headings, lists, checklists,
// quotes, links) that can be opened full screen for easier typing.
import { onBeforeUnmount, nextTick, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { toEditorHtml } from '@/journal/body'
import { messages } from '@/messages'

const props = defineProps<{ modelValue: string; label: string; placeholder?: string; minHeight?: string }>()
const emit = defineEmits<{ 'update:modelValue': [html: string]; blur: [] }>()
const m = messages.editor

const editor = useEditor({
  content: toEditorHtml(props.modelValue),
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['http', 'https', 'mailto', 'tel'] },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: props.placeholder ?? '' }),
  ],
  editorProps: {
    attributes: { 'aria-label': props.label, 'aria-multiline': 'true', role: 'textbox', class: 'rich outline-none' },
  },
  onUpdate: ({ editor: e }) => emit('update:modelValue', e.getHTML()),
  onBlur: () => emit('blur'),
})

// Keep the editor in step when the saved text changes from elsewhere (another device), but not while typing.
watch(
  () => props.modelValue,
  (value) => {
    const e = editor.value
    if (!e || e.isFocused || e.getHTML() === value) return
    e.commands.setContent(toEditorHtml(value), { emitUpdate: false })
  },
)
onBeforeUnmount(() => editor.value?.destroy())

type Mark = 'bold' | 'italic' | 'underline' | 'strike'
const marks: { key: Mark; label: string; text: string; cls: string }[] = [
  { key: 'bold', label: m.bold, text: 'B', cls: 'font-bold' },
  { key: 'italic', label: m.italic, text: 'I', cls: 'italic' },
  { key: 'underline', label: m.underline, text: 'U', cls: 'underline' },
  { key: 'strike', label: m.strike, text: 'S', cls: 'line-through' },
]
function toggleMark(key: Mark) {
  const chain = editor.value?.chain().focus()
  if (!chain) return
  if (key === 'bold') chain.toggleBold().run()
  else if (key === 'italic') chain.toggleItalic().run()
  else if (key === 'underline') chain.toggleUnderline().run()
  else chain.toggleStrike().run()
}

// ---------- Links: a small inline box instead of a browser prompt ----------
const linkOpen = ref(false)
const linkUrl = ref('')
const linkBox = ref<HTMLInputElement | null>(null)
async function openLink() {
  linkUrl.value = (editor.value?.getAttributes('link').href as string | undefined) ?? ''
  linkOpen.value = true
  await nextTick()
  linkBox.value?.focus()
}
function applyLink() {
  const e = editor.value
  if (!e) return
  let url = linkUrl.value.trim()
  if (!url) {
    e.chain().focus().extendMarkRange('link').unsetLink().run()
  } else {
    if (!/^(https?:|mailto:|tel:)/i.test(url)) url = `https://${url}`
    if (e.state.selection.empty && !e.isActive('link')) {
      e.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run()
    } else {
      e.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }
  linkOpen.value = false
}

// ---------- Full screen ----------
const fullScreen = ref(false)
async function toggleFullScreen() {
  fullScreen.value = !fullScreen.value
  await nextTick()
  editor.value?.commands.focus('end')
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && fullScreen.value) {
    if (linkOpen.value) linkOpen.value = false
    else fullScreen.value = false
  }
}

const btn = (on: boolean) => [
  'flex min-h-10 min-w-10 items-center justify-center rounded-lg px-2 text-sm',
  on ? 'bg-accent text-accent-ink' : 'text-ink hover:bg-bg',
]
</script>

<template>
  <div
    class="flex flex-col overflow-hidden border border-line bg-surface"
    :class="fullScreen ? 'fixed inset-0 z-50 rounded-none' : 'rounded-xl'"
    :role="fullScreen ? 'dialog' : undefined"
    :aria-modal="fullScreen ? 'true' : undefined"
    :aria-label="fullScreen ? label : undefined"
    @keydown="onKey"
  >
    <!-- Toolbar buttons never take focus from the writing, so the phone keyboard stays open and typing continues. -->
    <div
      v-if="editor"
      class="flex flex-wrap items-center gap-1 border-b border-line p-1"
      role="toolbar"
      :aria-label="m.toolbar"
      @mousedown.prevent
    >
      <button
        v-for="mk in marks"
        :key="mk.key"
        type="button"
        :class="[btn(editor.isActive(mk.key)), mk.cls]"
        :aria-label="mk.label"
        :aria-pressed="editor.isActive(mk.key)"
        @click="toggleMark(mk.key)"
      >
        {{ mk.text }}
      </button>
      <button
        type="button"
        :class="btn(editor.isActive('heading', { level: 2 }))"
        :aria-label="m.heading"
        :aria-pressed="editor.isActive('heading', { level: 2 })"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        H
      </button>
      <button
        type="button"
        :class="btn(editor.isActive('bulletList'))"
        :aria-label="m.bullets"
        :aria-pressed="editor.isActive('bulletList')"
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        •
      </button>
      <button
        type="button"
        :class="btn(editor.isActive('orderedList'))"
        :aria-label="m.numbers"
        :aria-pressed="editor.isActive('orderedList')"
        @click="editor.chain().focus().toggleOrderedList().run()"
      >
        1.
      </button>
      <button
        type="button"
        :class="btn(editor.isActive('taskList'))"
        :aria-label="m.checklist"
        :aria-pressed="editor.isActive('taskList')"
        @click="editor.chain().focus().toggleTaskList().run()"
      >
        ☑
      </button>
      <button
        type="button"
        :class="btn(editor.isActive('blockquote'))"
        :aria-label="m.quote"
        :aria-pressed="editor.isActive('blockquote')"
        @click="editor.chain().focus().toggleBlockquote().run()"
      >
        ❝
      </button>
      <button type="button" :class="btn(editor.isActive('link'))" :aria-label="m.link" :aria-pressed="editor.isActive('link')" @click="openLink">
        🔗
      </button>
      <button type="button" :class="[btn(false), 'ml-auto']" :aria-pressed="fullScreen" @click="toggleFullScreen">
        {{ fullScreen ? m.exitFullScreen : m.fullScreen }}
      </button>
    </div>

    <form v-if="linkOpen" class="flex gap-2 border-b border-line p-2" @submit.prevent="applyLink">
      <input
        ref="linkBox"
        v-model="linkUrl"
        type="text"
        autocomplete="url"
        inputmode="url"
        class="min-h-10 flex-1 rounded-lg border border-line bg-bg px-2 text-base text-ink"
        :aria-label="m.linkAddress"
        :placeholder="m.linkPlaceholder"
      >
      <button type="submit" class="min-h-10 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-ink">{{ m.linkApply }}</button>
      <button type="button" class="min-h-10 rounded-lg border border-line px-3 text-sm" @click="linkOpen = false">{{ m.linkCancel }}</button>
    </form>

    <EditorContent
      :editor="editor"
      class="flex-1 cursor-text overflow-y-auto px-3 py-2 text-base"
      :class="fullScreen ? 'mx-auto w-full max-w-2xl text-lg' : ''"
      :style="fullScreen ? undefined : { minHeight: minHeight ?? '16rem' }"
      @click="editor?.commands.focus()"
    />
  </div>
</template>
