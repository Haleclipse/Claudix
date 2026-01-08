import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import '@vscode/codicons/dist/codicon.css';
import '@mdi/font/css/materialdesignicons.min.css';
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
      id?: string;
    };
  }
}

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.mount('#app');
