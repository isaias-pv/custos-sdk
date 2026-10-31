import { Module, type DynamicModule, type InjectionToken, type ModuleMetadata, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { createVerifier, type VerifierOptions } from '@alimzen/custos-node';
import { CUSTOS_OPTIONS, CUSTOS_VERIFIER } from './constants.js';
import { CustosGuard } from './custos.guard.js';

export type CustosModuleOptions = VerifierOptions;

/** Options that shape the module itself, so they can't come from an async factory. */
export interface CustosModuleExtras {
  /** Register the module globally so `CustosGuard` is injectable everywhere. Default true. */
  isGlobal?: boolean;
  /** Protect every route; opt out with `@Public()`. Default false. */
  globalGuard?: boolean;
}

export interface CustosModuleAsyncOptions extends CustosModuleExtras, Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: never[]) => CustosModuleOptions | Promise<CustosModuleOptions>;
  inject?: InjectionToken[];
}

@Module({})
export class CustosModule {
  /**
   * @example
   * CustosModule.forRoot({ issuer: 'https://custos.alimzen.com', audience: 'my-app', globalGuard: true })
   */
  static forRoot(options: CustosModuleOptions & CustosModuleExtras): DynamicModule {
    const { isGlobal, globalGuard, ...config } = options;
    return CustosModule.build({ provide: CUSTOS_OPTIONS, useValue: config }, { isGlobal, globalGuard });
  }

  /**
   * @example
   * CustosModule.forRootAsync({
   *   inject: [ConfigService],
   *   useFactory: (config: ConfigService) => ({ issuer: config.getOrThrow('CUSTOS_ISSUER') }),
   *   globalGuard: true,
   * })
   */
  static forRootAsync(options: CustosModuleAsyncOptions): DynamicModule {
    const module = CustosModule.build(
      { provide: CUSTOS_OPTIONS, useFactory: options.useFactory, inject: options.inject ?? [] },
      { isGlobal: options.isGlobal, globalGuard: options.globalGuard },
    );
    return { ...module, imports: [...(module.imports ?? []), ...(options.imports ?? [])] };
  }

  private static build(
    optionsProvider: Provider,
    extras: { isGlobal: boolean | undefined; globalGuard: boolean | undefined },
  ): DynamicModule {
    const providers: Provider[] = [
      optionsProvider,
      { provide: CUSTOS_VERIFIER, useFactory: (o: VerifierOptions) => createVerifier(o), inject: [CUSTOS_OPTIONS] },
      CustosGuard,
    ];
    if (extras.globalGuard) providers.push({ provide: APP_GUARD, useExisting: CustosGuard });
    return {
      module: CustosModule,
      global: extras.isGlobal ?? true,
      providers,
      exports: [CUSTOS_VERIFIER, CustosGuard],
    };
  }
}
