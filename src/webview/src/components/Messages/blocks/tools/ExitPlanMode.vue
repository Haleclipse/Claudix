<template>
  <ToolMessageWrapper
    :tool-result="toolResult"
    :is-custom-layout="true"
  >
    <template #custom>
      <div class="plan-card">
        <!-- Plan header -->
        <div class="plan-header">
          <span class="codicon codicon-tasklist"></span>
          <span class="plan-title">Plan</span>
        </div>

        <!-- Plan content -->
        <div v-if="plan" class="plan-body" :class="{ 'is-expanded': isExpanded }">
          <div class="plan-content">
            <MarkdownContent :content="plan" />
          </div>
        </div>

        <!-- Expand button -->
        <div v-if="plan && !toolResult?.is_error" class="plan-footer">
          <button @click="toggleExpand" class="expand-button">
            <span class="codicon" :class="isExpanded ? 'codicon-chevron-up' : 'codicon-chevron-down'"></span>
            <span>{{ isExpanded ? 'Collapse' : 'Expand' }}</span>
          </button>
        </div>

        <!-- Error content -->
        <ToolError v-if="toolResult?.is_error" :tool-result="toolResult" />
      </div>
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import MarkdownContent from '../../MarkdownContent.vue';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolError from './common/ToolError.vue';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
}

const props = defineProps<Props>();

// Expand state
const isExpanded = ref(false);

// Plan content
const plan = computed(() => {
  return props.toolUse?.input?.plan || props.toolUseResult?.plan;
});

// Toggle expand/collapse
const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};
</script>

<style scoped>
.plan-card {
  display: flex;
  flex-direction: column;
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
  overflow: hidden;
}

.plan-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 95%, transparent);
  border-bottom: 1px solid var(--vscode-panel-border);
}

.plan-header .codicon {
  font-size: 16px;
}

.plan-title {
  font-size: 1em;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.plan-body {
  padding: 16px;
  max-height: 200px;
  overflow: hidden;
  position: relative;
  transition: max-height 0.3s ease;
}

.plan-body.is-expanded {
  max-height: none;
}

.plan-body:not(.is-expanded)::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 40px;
  background: linear-gradient(to bottom, transparent, var(--vscode-editor-background));
  pointer-events: none;
}

.plan-content {
  font-family: var(--vscode-editor-font-family);
  font-size: 0.9em;
  line-height: 1.6;
  color: var(--vscode-editor-foreground);
}

/* Markdown styles */
.plan-content :deep(h1) {
  font-size: 1.4em;
  font-weight: 600;
  margin-bottom: 12px;
  margin-top: 16px;
  color: var(--vscode-foreground);
}

.plan-content :deep(h1:first-child) {
  margin-top: 0;
}

.plan-content :deep(h2) {
  font-size: 1.2em;
  font-weight: 600;
  margin-bottom: 10px;
  margin-top: 16px;
  color: var(--vscode-foreground);
}

.plan-content :deep(h3) {
  font-size: 1.1em;
  font-weight: 600;
  margin-bottom: 8px;
  margin-top: 12px;
  color: var(--vscode-foreground);
}

.plan-content :deep(p) {
  margin-bottom: 8px;
  line-height: 1.6;
}

.plan-content :deep(ul),
.plan-content :deep(ol) {
  margin-bottom: 8px;
  padding-left: 24px;
}

.plan-content :deep(li) {
  margin-bottom: 4px;
}

.plan-content :deep(code) {
  background-color: color-mix(in srgb, var(--vscode-textCodeBlock-background) 50%, transparent);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family);
}

.plan-content :deep(pre) {
  background-color: var(--vscode-textCodeBlock-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 8px;
  overflow-x: auto;
  margin-bottom: 8px;
}

.plan-content :deep(pre code) {
  background: none;
  padding: 0;
}

/* Expand button */
.plan-footer {
  display: flex;
  justify-content: center;
  padding: 4px;
  border-top: 1px solid var(--vscode-panel-border);
  background-color: color-mix(in srgb, var(--vscode-editor-background) 95%, transparent);
}

.expand-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: transparent;
  border: none;
  color: var(--vscode-textLink-foreground);
  cursor: pointer;
  font-size: 0.85em;
  transition: color 0.15s ease;
}

.expand-button:hover {
  color: var(--vscode-textLink-activeForeground);
}

.expand-button .codicon {
  font-size: 12px;
}

</style>
