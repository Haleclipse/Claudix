import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { enableMermaid, setCustomComponents } from 'markstream-vue';
import App from './App.vue';
import MermaidDiagram from './components/Messages/MermaidDiagram.vue';
import '@vscode/codicons/dist/codicon.css';
import '@mdi/font/css/materialdesignicons.min.css';
import 'markstream-vue/index.css';
import 'virtual:svg-icons-register';

declare global {
  interface Window {
    acquireVsCodeApi?: <T = unknown>() => {
      postMessage(data: T): void;
      getState(): any;
      setState(data: any): void;
    };
    CLAUDIX_BOOTSTRAP?: {
      host?: 'sidebar' | 'editor';
      page?: string;
    };
  }
}

// Register custom Mermaid component BEFORE app mount
setCustomComponents({
  mermaid: MermaidDiagram
});
enableMermaid();

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.mount('#app');
