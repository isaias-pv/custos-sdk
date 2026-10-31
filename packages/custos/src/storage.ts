import type { CustosConfig, CustosUser, StorageLike, TokenSet } from './types.js';

export function memoryStorage(): StorageLike {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

/** Web Storage can throw (Safari private mode, blocked cookies, quota): fall back to memory. */
function webStorage(kind: 'localStorage' | 'sessionStorage'): StorageLike | null {
  try {
    const storage = (globalThis as Record<string, unknown>)[kind] as Storage | undefined;
    if (!storage) return null;
    const probe = '__custos_probe__';
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function resolveStorage(option: CustosConfig['storage']): StorageLike {
  if (option && typeof option === 'object') return option;
  if (option === 'memory') return memoryStorage();
  return webStorage(option === 'session' ? 'sessionStorage' : 'localStorage') ?? memoryStorage();
}

export interface StoredSession {
  tokens: TokenSet;
  user: CustosUser;
}

/** A login in progress: saved before the redirect, consumed by the callback. */
export interface Transaction {
  verifier: string;
  redirectUri: string;
  appState?: unknown;
  createdAt: number;
}

const TRANSACTION_TTL_MS = 15 * 60 * 1000;

function read<T>(storage: StorageLike, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: StorageLike, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or a blocked storage: the session lives on in memory for this page.
  }
}

function remove(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Same as write().
  }
}

export class SessionStore {
  private readonly sessionKey: string;
  private readonly txPrefix: string;
  /** PKCE transactions always go to sessionStorage: they must survive the redirect, but only in this tab. */
  private readonly txStorage: StorageLike;

  constructor(
    private readonly storage: StorageLike,
    prefix: string,
    clientId: string,
  ) {
    this.sessionKey = `${prefix}.${clientId}.session`;
    this.txPrefix = `${prefix}.${clientId}.tx.`;
    this.txStorage = webStorage('sessionStorage') ?? storage;
  }

  get key(): string {
    return this.sessionKey;
  }

  getSession(): StoredSession | null {
    const session = read<StoredSession>(this.storage, this.sessionKey);
    return session?.tokens?.accessToken && session.user?.sub ? session : null;
  }

  setSession(session: StoredSession): void {
    write(this.storage, this.sessionKey, session);
  }

  clearSession(): void {
    remove(this.storage, this.sessionKey);
  }

  saveTransaction(state: string, tx: Transaction): void {
    write(this.txStorage, this.txPrefix + state, tx);
  }

  /** Reads and deletes the transaction, so a `state` can only be used once. */
  takeTransaction(state: string, now = Date.now()): Transaction | null {
    const tx = read<Transaction>(this.txStorage, this.txPrefix + state);
    remove(this.txStorage, this.txPrefix + state);
    if (!tx || now - tx.createdAt > TRANSACTION_TTL_MS) return null;
    return tx;
  }
}
