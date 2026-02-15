# @custos/sdk

Official JavaScript SDK for Custos Authentication

## Installation
```bash
npm install @custos/sdk
# or
yarn add @custos/sdk
# or
pnpm add @custos/sdk
```

## Quick Start
```javascript
import { Custos } from '@custos/sdk'

const auth = new Custos({
  clientId: 'your-client-id',
  redirectUri: 'https://your-app.com/callback'
})

// Login
await auth.login()

// Get user
const user = auth.getUser()
console.log(user.email)

// Logout
await auth.logout()
```

## Configuration
```typescript
interface CustosConfig {
  clientId: string;           // Required
  clientSecret?: string;      // Optional (for server-side)
  redirectUri: string;        // Required
  apiUrl?: string;           // Optional (default: https://custos.alimzen.com)
  scope?: string[];          // Optional (default: ['openid', 'profile', 'email'])
}
```

## API Reference

### Methods

#### `login()`
Redirects user to Custos login page

#### `logout()`
Logs out user and clears tokens

#### `getUser()`
Returns current user or null

#### `getAccessToken()`
Returns access token or null

#### `isAuthenticated()`
Returns boolean

#### `getState()`
Returns complete auth state

### Events
```javascript
auth.on('login', (event) => {
  console.log('User logged in:', event.data.user)
})

auth.on('logout', () => {
  console.log('User logged out')
})

auth.on('token-refresh', (event) => {
  console.log('Token refreshed:', event.data)
})

auth.on('error', (event) => {
  console.error('Auth error:', event.data)
})
```

## Framework Examples

### React
```jsx
import { useState, useEffect } from 'react'
import { Custos } from '@custos/sdk'

const auth = new Custos({
  clientId: 'your-client-id',
  redirectUri: 'http://localhost:3000/callback'
})

function App() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    setUser(auth.getUser())
    
    auth.on('login', (e) => setUser(e.data.user))
    auth.on('logout', () => setUser(null))
  }, [])

  if (!user) {
    return <button onClick={() => auth.login()}>Login</button>
  }

  return (
    <div>
      <h1>Welcome {user.name}</h1>
      <button onClick={() => auth.logout()}>Logout</button>
    </div>
  )
}
```

### Vue
```vue
<template>
  <div>
    <button v-if="!user" @click="login">Login</button>
    <div v-else>
      <h1>Welcome {{ user.name }}</h1>
      <button @click="logout">Logout</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Custos } from '@custos/sdk'

const auth = new Custos({
  clientId: 'your-client-id',
  redirectUri: 'http://localhost:3000/callback'
})

const user = ref(null)

onMounted(() => {
  user.value = auth.getUser()
  auth.on('login', (e) => user.value = e.data.user)
  auth.on('logout', () => user.value = null)
})

const login = () => auth.login()
const logout = () => auth.logout()
</script>
```

## License

MIT © Alim