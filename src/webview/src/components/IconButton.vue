<script setup lang="ts">
const props = defineProps<{
  icon: string;
  title?: string;
  size?: number;
}>();

defineEmits<{
  (e: 'click'): void;
}>();

const buttonSize = props.size || 24;
const iconSize = Math.floor(buttonSize * 0.5);
</script>

<template>
  <button class="icon-btn" :title="title" :style="{ width: `${buttonSize}px`, height: `${buttonSize}px` }"
    @click="$emit('click')">
    <span :class="['codicon', `codicon-${icon}`]" :style="{ fontSize: `${iconSize}px` }"></span>
  </button>
</template>

<style scoped>
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--vscode-titleBar-activeForeground);
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.2s;
  opacity: 0.7;
}

.icon-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  opacity: 1;
}
</style>
