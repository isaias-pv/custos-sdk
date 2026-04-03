# React Example (Current SDK)

## auth.ts

```ts
import { Custos } from '@isaias_pv/custos-sdk';

export const auth = new Custos({
  clientId: 'your-client-id',
  redirectUri: window.location.origin + '/auth/callback',
  apiUrl: 'https://custos.alimzen.com',
  scope: 'openid profile email',
  usePKCE: true,
  useSessionStorage: false,
});
```

## App.tsx

```tsx
import { useEffect } from 'react';
import { auth } from './auth';

export default function App() {
  useEffect(() => {
    const onLogin = (event: any) => console.log('login', event.data.user);
    const onError = (event: any) => console.error('error', event.data);

    auth.on('login', onLogin);
    auth.on('error', onError);

    (async () => {
      await auth.silentAuth();

      if (auth.hasCallbackParams()) {
        await auth.handleCallback();
      }
    })();

    return () => {
      auth.off('login', onLogin);
      auth.off('error', onError);
      auth.destroy();
    };
  }, []);

  return (
    <div>
      <button onClick={() => auth.login()}>Login</button>
      <button onClick={() => auth.logout()}>Logout</button>
    </div>
  );
}
```
