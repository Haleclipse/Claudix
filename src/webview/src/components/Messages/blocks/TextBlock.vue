<template>
  <div class="text-block">
    <div :class="markdownClasses">
      <MarkdownContent :content="displayText" :final="!isStreaming" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSignal } from '@gn8/alien-signals-vue';
import MarkdownContent from '../MarkdownContent.vue';
import type { TextBlock as TextBlockType } from '../../../models/ContentBlock';
import type { ContentBlockWrapper } from '../../../models/ContentBlockWrapper';
import type { ToolContext } from '../../../types/tool';

interface Props {
  block: TextBlockType;
  context?: ToolContext;
  wrapper?: ContentBlockWrapper;
}

const props = defineProps<Props>();

// Streaming state - reactively consumed via useSignal (consistent pattern)
const isStreaming = props.wrapper
  ? useSignal(props.wrapper.isStreaming)
  : computed(() => false);

// Display text - reactively consumed via useSignal (follows toolResult pattern)
const displayText = props.wrapper
  ? useSignal(props.wrapper.text)
  : computed(() => props.block.text ?? '');

// Markdown class names
const markdownClasses = computed(() => {
  const classes = ['markdown-content'];
  if (props.block.isSlashCommand) {
    classes.push('slash-command-text');
  }
  return classes;
});
</script>

<style scoped>
.text-block {
  margin: 0;
  padding: 0px 2px;
}

.markdown-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--vscode-editor-foreground);
  word-wrap: break-word;
  user-select: text;
}

.slash-command-text {
  color: var(--vscode-textLink-foreground);
  font-weight: 600;
}

/* Markdown base styles - Claudex style */
.markdown-content :deep(p) {
  margin: 8px 0;
  line-height: 1.6;
}

.markdown-content :deep(code) {
  font-family: var(--vscode-editor-font-family, 'Hack Nerd Font Mono', 'SF Mono', Consolas, 'Courier New', monospace);
  word-break: break-all;
  cursor: default;
}

.markdown-content :deep(pre) {
  background-color: color-mix(in srgb, var(--vscode-editor-background) 50%, transparent);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 12px;
  margin: 8px 0;
  overflow-x: auto;
}

.markdown-content :deep(pre code) {
  background: none;
  border: none;
  padding: 0;
}

.markdown-content :deep(:not(pre) > code) {
  background-color: color-mix(in srgb, var(--vscode-editor-background) 50%, transparent);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 3px;
  padding: 2px 4px;
  font-size: 0.9em;
}

.markdown-content :deep(a) {
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
}

.markdown-content :deep(a:hover) {
  color: var(--vscode-textLink-activeForeground);
  text-decoration: underline;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0px 0px 0px 16px;
  padding: 0px;
}

.markdown-content :deep(li) {
  padding-top: 2px;
  padding-bottom: 2px;
  list-style-type: disc;
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid var(--vscode-textBlockQuote-border);
  background-color: var(--vscode-textBlockQuote-background);
  margin: 8px 0;
  padding: 8px 16px;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  color: var(--vscode-foreground);
  font-weight: 600;
  margin: 16px 0 8px 0;
  line-height: 1.3;
}

.markdown-content :deep(h1) {
  font-size: 18px;
}

.markdown-content :deep(h2) {
  font-size: 16px;
}

.markdown-content :deep(h3) {
  font-size: 14px;
}

.markdown-content :deep(table) {
  border-collapse: collapse;
  margin: 16px 0;
  width: 100%;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid var(--vscode-panel-border);
  padding: 8px 12px;
  text-align: left;
}

.markdown-content :deep(th) {
  background-color: color-mix(in srgb, var(--vscode-editor-background) 30%, transparent);
  font-weight: 600;
}
</style>
