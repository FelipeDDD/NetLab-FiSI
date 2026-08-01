import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // ExFAT volumes on macOS grow AppleDouble "._foo" companion files;
    // they are not source code.
    exclude: ['**/node_modules/**', '**/._*'],
  },
});
