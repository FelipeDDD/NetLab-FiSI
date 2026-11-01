import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), {
    name: 'netlab-diagnosis-development-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req,res,next) => {
        if(req.url?.split('?')[0]!=='/__diagnosis_preview__')return next();
        try {
          const html=await server.transformIndexHtml('/__diagnosis_preview__','<!doctype html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>NetLab · Netzwerkdiagnose Preview</title></head><body><div id="root"></div><script type="module" src="/src/exercises/diagnosis/previewEntry.tsx"></script></body></html>');
          res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(html);
        } catch(error) {next(error);}
      });
    },
  }],
  base: './',
  server: {
    // Existing browser data belongs to this origin. Never silently change it.
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      // Two pages: the marketing/landing page at / and the app at /app.html.
      input: {
        main: 'index.html',
        app: 'app.html',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // ExFAT volumes on macOS grow AppleDouble "._foo" companion files;
    // they are not source code.
    exclude: ['**/node_modules/**', '**/._*'],
  },
});
