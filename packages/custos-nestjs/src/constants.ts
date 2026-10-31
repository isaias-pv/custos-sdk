/** Injection token for the options passed to `CustosModule.forRoot()` / `forRootAsync()`. */
export const CUSTOS_OPTIONS = Symbol.for('custos:options');
/** Injection token for the `TokenVerifier` from `@alimzen/custos-node`. */
export const CUSTOS_VERIFIER = Symbol.for('custos:verifier');
/** Metadata keys set by the decorators. */
export const IS_PUBLIC_KEY = 'custos:public';
export const REQUIREMENTS_KEY = 'custos:requirements';
