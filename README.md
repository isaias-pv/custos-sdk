# @alim/custos

SDK de autenticación OAuth 2.0 + PKCE para Custos.

## 🚀 Instalación

```bash
npm install @alim/custos
```

## ✨ Características

- ✅ OAuth 2.0 con PKCE (Proof Key for Code Exchange)
- ✅ Soporte para Web y Apps Nativas (Ionic/Capacitor)
- ✅ Refresh automático de tokens
- ✅ Sistema de eventos (login, logout, error, etc.)
- ✅ TypeScript con tipos completos
- ✅ Persistencia en localStorage (no sessionStorage)
- ✅ Sin dependencias externas

## 📖 Uso Básico

### 1. Inicialización

```typescript
import { Custos } from '@alim/custos';

const auth = new Custos({
  clientId: 'tu_client_id',
  redirectUri: 'http://localhost:8100/auth/callback',
  apiUrl: 'https://custos.alimzen.com',
  scope: 'openid profile email',
  usePKCE: true,
  useSessionStorage: false // ⚠️ Siempre false para apps nativas
});
```

### 2. Configurar Event Listeners

```typescript
// Login exitoso
auth.on('login', (event) => {
  const { user, tokens } = event.data;
  console.log('Usuario autenticado:', user);
  console.log('Access Token:', tokens.accessToken);
});

// Error de autenticación
auth.on('error', (event) => {
  console.error('Error:', event.data);
});

// Token expirado
auth.on('token-expired', () => {
  console.log('Token expirado, redirigiendo a login...');
});

// Token actualizado (refresh automático)
auth.on('token-refresh', (event) => {
  console.log('Token actualizado:', event.data);
});

// Logout
auth.on('logout', () => {
  console.log('Usuario desconectado');
});
```

### 3. Iniciar Login

```typescript
// Para apps web
async function login() {
  await auth.login();
  // El usuario será redirigido a Custos
}
```

### 4. Manejar Callback

```typescript
// En tu componente de callback (ej: /auth/callback)
async function handleCallback() {
  // Verificar si hay parámetros de callback
  if (auth.hasCallbackParams()) {
    await auth.handleCallback();
    // El evento 'login' se disparará automáticamente
  }
}
```

## 🔧 Uso en Angular/Ionic

### Componente de Login

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Custos } from '@alim/custos';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html'
})
export class LoginComponent implements OnInit, OnDestroy {
  private auth: Custos;
  isLoading = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.auth = new Custos({
      clientId: 'your_client_id',
      redirectUri: 'http://localhost:8100/auth/callback',
      apiUrl: 'https://custos.alimzen.com',
      usePKCE: true
    });

    this.setupListeners();
  }

  ngOnInit() {
    // Manejar callback de OAuth
    this.route.queryParams.subscribe(async params => {
      const code = params['code'];
      const error = params['error'];

      if (error) {
        console.error('OAuth error:', params['error_description']);
        return;
      }

      if (code) {
        this.isLoading = true;
        try {
          await this.auth.handleCallback();
        } catch (error) {
          console.error('Callback error:', error);
          this.isLoading = false;
        }
      }
    });
  }

  ngOnDestroy() {
    this.auth.destroy();
  }

  private setupListeners() {
    this.auth.on('login', () => {
      this.router.navigate(['/home']);
    });

    this.auth.on('error', (event) => {
      console.error('Auth error:', event.data);
      this.isLoading = false;
    });
  }

  async login() {
    this.isLoading = true;
    await this.auth.login();
  }

  async logout() {
    await this.auth.logout();
  }
}
```

## 📱 Uso en Apps Nativas (Ionic/Capacitor)

Para apps nativas, el flujo es ligeramente diferente debido al uso de deep linking:

### 1. Configurar Deep Linking

**capacitor.config.ts**
```typescript
const config: CapacitorConfig = {
  appId: 'com.alim.myapp',
  plugins: {
    App: {}
  },
  android: {
    intentFilters: [{
      action: 'VIEW',
      category: ['BROWSABLE', 'DEFAULT'],
      data: [{ 
        scheme: 'myapp', 
        host: 'auth', 
        pathPrefix: '/callback' 
      }]
    }]
  }
};
```

**iOS Info.plist**
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array><string>myapp</string></array>
  </dict>
</array>
```

### 2. Componente de Login Nativo

```typescript
import { Browser } from '@capacitor/browser';

@Component({...})
export class LoginComponent {
  async loginNative() {
    // Generar URL de autorización manualmente
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    const state = this.generateState();

    // Guardar en localStorage
    localStorage.setItem('custos_code_verifier', codeVerifier);
    localStorage.setItem('custos_oauth_state', state);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: 'your_client_id',
      redirect_uri: 'myapp://auth/callback',
      scope: 'openid profile',
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    const authUrl = `https://custos.alimzen.com/v1/auth/authorize?${params}`;

    // Abrir navegador del sistema
    await Browser.open({
      url: authUrl,
      windowName: '_system'
    });
  }

  // Helpers para PKCE
  private generateCodeVerifier(): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const length = 128;
    let verifier = '';
    for (let i = 0; i < length; i++) {
      verifier += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return verifier;
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(digest);
    const binary = Array.from(bytes, b => String.fromCharCode(b)).join('');
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private generateState(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
```

## 🔑 API Completa

### Constructor

```typescript
new Custos(config: CustosConfig)
```

**CustosConfig:**
- `clientId` (string, requerido): ID del cliente OAuth
- `clientSecret` (string, opcional): Secret del cliente
- `redirectUri` (string, requerido): URI de redirección
- `apiUrl` (string, opcional): URL base de la API (default: 'https://custos.alimzen.com')
- `scope` (string | string[], opcional): Scopes OAuth (default: 'openid profile')
- `usePKCE` (boolean, opcional): Usar PKCE (default: true)
- `useSessionStorage` (boolean, opcional): Usar sessionStorage en vez de localStorage (default: false, ⚠️ NO recomendado para apps nativas)

### Métodos

#### `login(additionalParams?: Record<string, string>): Promise<void>`
Inicia el flujo de autenticación OAuth.

#### `handleCallback(): Promise<void>`
Maneja el callback de OAuth. Debe ser llamado cuando detectes parámetros de callback en la URL.

#### `logout(): Promise<void>`
Cierra la sesión del usuario y limpia el storage.

#### `getUser(): User | null`
Obtiene la información del usuario autenticado.

#### `getAccessToken(): string | null`
Obtiene el access token actual.

#### `getRefreshToken(): string | null`
Obtiene el refresh token actual.

#### `isAuthenticated(): boolean`
Verifica si hay un usuario autenticado.

#### `hasCallbackParams(): boolean`
Verifica si hay parámetros de callback en la URL actual.

#### `refreshToken(): Promise<void>`
Refresca manualmente el access token.

#### `validateToken(): Promise<boolean>`
Valida el access token actual contra el servidor.

#### `on(event: AuthEventType, callback: (event: AuthEvent) => void): void`
Registra un listener para eventos de autenticación.

**Eventos disponibles:**
- `login`: Se dispara cuando el usuario inicia sesión exitosamente
- `logout`: Se dispara cuando el usuario cierra sesión
- `error`: Se dispara cuando ocurre un error de autenticación
- `token-refresh`: Se dispara cuando los tokens se actualizan
- `token-expired`: Se dispara cuando el token expira

#### `off(event: AuthEventType, callback: (event: AuthEvent) => void): void`
Remueve un listener de eventos.

#### `destroy(): void`
Limpia los timers y listeners. Llama a este método cuando destruyas el componente.

## 🐛 Troubleshooting

### Error: "State parameter mismatch"

**Causa:** El `state` guardado en localStorage no coincide con el recibido.

**Solución:**
1. Asegúrate de que `useSessionStorage` sea `false`
2. Verifica que no estés limpiando localStorage entre login y callback
3. En apps nativas, asegúrate de que el deep link apunte al mismo dominio

### Error: "Code verifier not found"

**Causa:** El `code_verifier` no se encuentra en localStorage cuando se procesa el callback.

**Solución:**
1. Asegúrate de que `useSessionStorage` sea `false`
2. En apps nativas, guarda el `code_verifier` manualmente antes de abrir el navegador
3. Verifica que no estés limpiando localStorage

### Tokens no persisten entre recargas

**Causa:** Usando `sessionStorage` en vez de `localStorage`.

**Solución:** Configura `useSessionStorage: false` en el constructor.

## 📄 Licencia

MIT

## 🤝 Contribuir

¿Encontraste un bug? ¿Tienes una sugerencia? Abre un issue en GitHub.

## 📧 Soporte

Para soporte, contacta a soporte@alimzen.com
