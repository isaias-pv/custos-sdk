import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // Angular apps bundle ESM only; no CJS build.
  format: ['esm'],
  // Resolve @alimzen/custos through its published types, so they are referenced rather than inlined.
  dts: { compilerOptions: { customConditions: [] } },
  sourcemap: true,
  clean: true,
  target: 'es2022',
});
