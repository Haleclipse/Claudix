<template>
  <!-- Streaming mode: virtualization enabled for performance -->
  <MarkdownRender
    v-if="!final"
    :content="content"
    :enable-mermaid="true"
    :is-dark="isDark"
    :max-live-nodes="320"
    :live-node-buffer="60"
    :code-block-stream="true"
    :viewport-priority="true"
    :defer-nodes-until-visible="true"
    :typewriter="true"
  />
  <!-- Final mode: full rendering quality -->
  <MarkdownRender
    v-else
    :content="content"
    :enable-mermaid="true"
    :is-dark="isDark"
  />
</template>

<script setup lang="ts">
import { MarkdownRender } from 'markstream-vue';
import { useThemeDetector } from '../../utils/themeDetector';

defineProps<{
  content: string;
  final?: boolean;
}>();

const { isDark } = useThemeDetector();
</script>
