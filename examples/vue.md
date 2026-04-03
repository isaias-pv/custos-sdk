# Vue 3 Example (Current SDK)

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

## App.vue

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { auth } from './auth';

const onLogin = (event: any) => console.log('login', event.data.user);
const onError = (event: any) => console.error('auth error', event.data);

onMounted(async () => {
  auth.on('login', onLogin);
  auth.on('error', onError);

  await auth.silentAuth();

  if (auth.hasCallbackParams()) {
    await auth.handleCallback();
  }
});

onBeforeUnmount(() => {
  auth.off('login', onLogin);
  auth.off('error', onError);
  auth.destroy();
});

const login = async () => {
  await auth.login();
};

const logout = async () => {
  await auth.logout();
};
</script>

<template>
  <main>
    <button @click="login">Login</button>
    <button @click="logout">Logout</button>
  </main>
</template>
```
