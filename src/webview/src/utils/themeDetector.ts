import { ref, onMounted } from 'vue';

// Singleton state at module scope - shared by all consumers
const isDark = ref(true);
let observer: MutationObserver | null = null;
let initialized = false;

const detectTheme = () => {
  const body = document.body;
  // VSCode adds 'vscode-dark', 'vscode-light', or 'vscode-high-contrast' class to body
  isDark.value = body.classList.contains('vscode-dark') ||
                 body.classList.contains('vscode-high-contrast');
};

const ensureInitialized = () => {
  if (initialized || typeof document === 'undefined') return;

  detectTheme();

  // Watch for theme changes via MutationObserver (single instance for entire app)
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        detectTheme();
        break;
      }
    }
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });

  initialized = true;
};

/**
 * Detects VSCode dark/light theme from document.body.classList
 * and watches for theme changes via MutationObserver.
 *
 * Uses a singleton pattern - the observer is created once and shared
 * by all components that use this composable.
 */
export function useThemeDetector() {
  onMounted(() => {
    ensureInitialized();
  });

  return { isDark };
}
