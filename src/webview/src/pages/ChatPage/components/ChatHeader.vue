<script setup lang="ts">
import IconButton from '@/components/IconButton.vue';

defineProps<{
  title: string
}>();

defineEmits<{
  (e: 'menuClick'): void;
  (e: 'newChat'): void;
}>();
</script>

<template>
  <div class="chat-header">
    <div class="header-left">
      <IconButton icon="menu" @click="$emit('menuClick')" />
      <div class="chat-title" :title="title">{{ title }}</div>
    </div>
    <IconButton icon="plus" title="新开对话" @click="$emit('newChat')" />
  </div>
</template>

<style scoped>
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--vscode-panel-border);
  min-height: 32px;
  padding: 0 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  flex: 1;
}

.chat-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-titleBar-activeForeground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>