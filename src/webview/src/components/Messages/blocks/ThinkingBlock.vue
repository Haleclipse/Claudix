<template>
  <div class="thinking-block">
    <div class="thinking-header" @click="toggleExpanded">
      <span class="thinking-label">{{ isStreaming ? 'Thinking...' : 'Thought' }}</span>
      <span class="codicon" :class="expanded ? 'codicon-chevron-up' : 'codicon-chevron-down'" />
    </div>
    <div v-if="expanded" class="thinking-content">
      {{ displayText }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSignal } from '@gn8/alien-signals-vue';
import type { ThinkingBlock as ThinkingBlockType } from '../../../models/ContentBlock';
import type { ContentBlockWrapper } from '../../../models/ContentBlockWrapper';

interface Props {
  block: ThinkingBlockType;
  wrapper?: ContentBlockWrapper;
}

const props = defineProps<Props>();

const expanded = ref(false);

// Streaming state - reactively consumed via useSignal (consistent pattern)
const isStreaming = props.wrapper
  ? useSignal(props.wrapper.isStreaming)
  : computed(() => false);

// Display text - reactively consumed via useSignal (follows toolResult pattern)
const displayText = props.wrapper
  ? useSignal(props.wrapper.text)
  : computed(() => props.block.thinking ?? '');

function toggleExpanded() {
  expanded.value = !expanded.value;
}
</script>

<style scoped>
.thinking-block {
  margin: 4px 0;
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.thinking-header .codicon {
  font-size: 14px;
  color: var(--vscode-descriptionForeground);
  opacity: 0.7;
  transition: opacity 0.1s ease;
}

.thinking-header:hover .codicon {
  opacity: 1;
}

.thinking-label {
  font-size: 14px;
  font-style: italic;
  color: var(--vscode-descriptionForeground);
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.thinking-header:hover .thinking-label {
  opacity: 1;
}

.thinking-content {
  margin-left: 16px;
  padding: 4px 0;
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--app-secondary-foreground);
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
