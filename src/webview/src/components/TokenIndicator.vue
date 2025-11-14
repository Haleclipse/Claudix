<template>
  <div
    class="progress-container"
    :style="containerStyle"
  >
    <span class="progress-text" data-responsive="hide-small">{{ formattedPercentage }}</span>
    <div class="progress-circle">
      <svg width="14" height="14" class="progress-svg">
        <circle
          cx="7"
          cy="7"
          r="5.25"
          :stroke="strokeColor"
          stroke-width="1.5"
          fill="none"
          opacity="0.25"
        />
        <circle
          cx="7"
          cy="7"
          r="5.25"
          :stroke="strokeColor"
          stroke-width="1.5"
          fill="none"
          stroke-linecap="round"
          opacity="0.9"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="strokeOffset"
          transform="rotate(-90 7 7)"
          class="progress-arc"
        />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  percentage: number
  size?: number
}

const props = withDefaults(defineProps<Props>(), {
  percentage: 0,
  size: 14
})

const circumference = computed(() => {
  const radius = 5.25
  return 2 * Math.PI * radius
})

const strokeOffset = computed(() => {
  const progress = Math.max(0, Math.min(100, props.percentage))
  return circumference.value - (progress / 100) * circumference.value
})

const formattedPercentage = computed(() => {
  const value = props.percentage
  // 如果是整数，不显示小数点；否则显示一位小数
  return `${value % 1 === 0 ? Math.round(value) : value.toFixed(1)}%`
})

const containerStyle = computed(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  // paddingLeft: '4px',
  // paddingRight: '2px',
  // backgroundColor: 'var(--vscode-input-background)',
  // borderRadius: '4px',
  // boxShadow: 'rgba(0, 0, 0, 0.1) 0px 1px 3px',
  cursor: 'default'
}))

const strokeColor = 'color-mix(in srgb,var(--vscode-foreground) 92%,transparent)'
</script>

<style scoped>
.progress-container {
  position: relative;
  z-index: 100;
}

.progress-text {
  font-size: 12px;
  color: color-mix(in srgb,var(--vscode-foreground) 48%,transparent);
  line-height: 1;
}

.progress-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
}

.progress-svg {
  position: absolute;
}

.progress-arc {
  transition: stroke-dashoffset 0.3s ease;
}
</style>