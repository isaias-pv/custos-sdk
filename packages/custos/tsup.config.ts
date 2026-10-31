import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2020',
  },
  {
    // <script src=".../custos.global.js"> exposes window.Custos (Custos, CustosError, ...).
    entry: { custos: 'src/index.ts' },
    format: ['iife'],
    globalName: 'Custos',
    minify: true,
    sourcemap: true,
    target: 'es2020',
  },
]);
