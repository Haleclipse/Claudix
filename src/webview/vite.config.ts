import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons';

export default defineConfig(({ mode }) => ({
  root: __dirname,
  server: {
    port: Number(process.env.VITE_DEV_PORT) || 5173,
    strictPort: true,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    fs: {
      // 允许从工作区根目录及外部资源目录读取文件（用于别名资源与图标目录）
      allow: [
        path.resolve(__dirname, '../..'),
        path.resolve(__dirname, '../../assets'),
        path.resolve(__dirname, '../../resources'),
        path.resolve(__dirname, '../../node_modules'),
      ],
    },
  },
  plugins: [
    vue(),
    tailwindcss(),
    createSvgIconsPlugin({
      iconDirs: [path.resolve(__dirname, '../../assets/icons')],
      symbolId: 'icon-[name]',
      svgoOptions: true,
    }),
    {
      name: 'filter-mdi-fonts',
      generateBundle(options, bundle) {
        // 只保留 woff2 格式的 MDI 字体，删除其他格式
        for (const fileName of Object.keys(bundle)) {
          if (fileName.includes('materialdesignicons-webfont') && !fileName.endsWith('.woff2')) {
            delete bundle[fileName];
          }
        }
      },
    },
    {
      name: 'copy-svg-icons-to-media',
      apply: 'build',
      async writeBundle(options, bundle) {
        const srcDir = path.resolve(__dirname, '../../assets/icons');
        const outDir = (options as any).dir || path.resolve(__dirname, '../../dist/media');
        const destDir = path.resolve(outDir, 'icons');

        async function ensureDir(dir: string) {
          await fsp.mkdir(dir, { recursive: true });
        }

        async function copyDir(src: string, dest: string) {
          await ensureDir(dest);
          const entries = await fsp.readdir(src, { withFileTypes: true });
          for (const entry of entries) {
            const s = path.join(src, entry.name);
            const d = path.join(dest, entry.name);
            if (entry.isDirectory()) {
              await copyDir(s, d);
            } else if (entry.isFile()) {
              await fsp.copyFile(s, d);
            }
          }
        }

        if (fs.existsSync(srcDir)) {
          await copyDir(srcDir, destDir);
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 使用本地的 codicon 资源替换依赖包中的资源
      '@vscode/codicons/dist/codicon.css': path.resolve(__dirname, '../../assets/codicons/codicon.css'),
      '@vscode/codicons/dist/codicon.ttf': path.resolve(__dirname, '../../assets/codicons/codicon.ttf'),
      // Force mermaid to use pre-built ESM bundle (fixes dynamic import issues in webview)
      'mermaid': path.resolve(__dirname, '../../node_modules/mermaid/dist/mermaid.esm.min.mjs'),
    },
  },
  base: '',
  optimizeDeps: {
    include: ['mermaid'],
  },
  build: {
    outDir: path.resolve(__dirname, '../../dist/media'),
    emptyOutDir: true,
    assetsDir: '',
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name ?? '';
          if (name.endsWith('.css')) return 'style.css';
          if (name.includes('materialdesignicons-webfont') && name.endsWith('.woff2')) {
            return 'materialicon.woff2';
          }
          return '[name][extname]';
        },
      },
    },
  },
}));
