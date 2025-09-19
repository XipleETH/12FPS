import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

// Revert to working server build config (commit 1d1aa3...) to ensure '@devvit/web/server' exports
// are resolved server-side instead of pulling in the client panic shim which omits redis/context.
export default defineConfig({
  root: 'src/server',
  ssr: {
    noExternal: true,
  },
  build: {
    emptyOutDir: false,
  ssr: 'index.ts',
    outDir: '../../dist/server',
    target: 'node22',
    sourcemap: true,
    rollupOptions: {
      external: [
        ...builtinModules,
      ],
      output: {
        format: 'cjs',
        entryFileNames: 'index.cjs',
        inlineDynamicImports: true,
      },
    },
  },
});
