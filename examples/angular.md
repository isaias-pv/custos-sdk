# Ejemplo de Uso Actualizado en Angular

## sign-in.component.ts (Simplificado con SDK)

```typescript
import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Custos } from '@isaias_pv/custos-sdk';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/utils/toast.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.css'
})
export class SignInComponent implements OnInit {
  private auth: Custos;

  constructor(
    private _toast: ToastService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    // Inicializar SDK
    this.auth = new Custos({
      clientId: environment.client_id,
      redirectUri: environment.redirect_uri + '/#/auth/sign-in',
      apiUrl: environment.url_auth,
      scope: environment.scope, // Acepta string o array
      usePKCE: true, // Habilitar PKCE
      codeChallengeMethod: 'S256'
    });

    // Escuchar eventos
    this.setupAuthListeners();
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.handleAuthentication();
    }
  }

  ngOnDestroy(): void {
    this.auth.destroy();
  }

  private setupAuthListeners(): void {
    // Login exitoso
    this.auth.on('login', (event) => {
      this._toast.success('Autenticación completada');
      const user = event.data.user;
      console.log('Usuario autenticado:', user);
      
      // Redirigir
      this.router.navigate(['/dashboard']);
    });

    // Logout
    this.auth.on('logout', () => {
      this._toast.info('Sesión cerrada');
      this.router.navigate(['/auth/sign-in']);
    });

    // Token expirado
    this.auth.on('token-expired', () => {
      this._toast.warning('Sesión expirada');
      this.router.navigate(['/auth/sign-in']);
    });

    // Errores
    this.auth.on('error', (event) => {
      const error = event.data;
      this._toast.error(`Error: ${error.error_description || error.message}`);
    });

    // Token refresh
    this.auth.on('token-refresh', () => {
      console.log('Token actualizado automáticamente');
    });
  }

  private async handleAuthentication(): Promise<void> {
    // 1. Verificar si ya está autenticado
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
      return;
    }

    // 2. El SDK maneja el callback automáticamente
    // Si hay un 'code' en la URL, lo procesa
    // Si no, se queda esperando que el usuario haga login

    // 3. Si no hay code y no está autenticado, mostrar botón de login
    // (el template maneja esto)
  }

  // Método para iniciar login manualmente
  async login(): Promise<void> {
    try {
      await this.auth.login();
      // El SDK redirige automáticamente al authorization endpoint
    } catch (error) {
      this._toast.error('Error al iniciar sesión');
    }
  }

  // Método para logout
  async logout(): Promise<void> {
    try {
      await this.auth.logout();
    } catch (error) {
      this._toast.error('Error al cerrar sesión');
    }
  }

  // Obtener información del usuario
  getUser() {
    return this.auth.getUser();
  }

  // Obtener token de acceso
  getAccessToken() {
    return this.auth.getAccessToken();
  }
}
```

## sign-in.component.html

```html
<div class="auth-container">
  @if (auth.isAuthenticated()) {
    <div class="authenticated">
      <h2>Bienvenido {{ getUser()?.name }}</h2>
      <p>{{ getUser()?.email }}</p>
      <button (click)="logout()">Cerrar sesión</button>
    </div>
  } @else {
    <div class="login">
      <h2>Iniciar Sesión</h2>
      <button (click)="login()" class="btn-login">
        Ingresar con Custos
      </button>
    </div>
  }
</div>
```

## environment.ts

```typescript
export const environment = {
  production: false,
  client_id: 'app_9c5679492e6cd0106e571bb37f8d3674',
  redirect_uri: 'http://localhost:4200',
  url_auth: 'https://custos.alimzen.com',
  
  // Scope puede ser string o array - el SDK lo normaliza
  scope: 'openid profile email', // O ['openid', 'profile', 'email']
  
  // Ya no necesitas estos (el SDK los maneja):
  // response_type: 'code',
  // grant_type: 'authorization_code',
  // code_challenge_method: 'S256',
  // state: '...'
};
```

## auth.guard.ts (Opcional)

```typescript
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Custos } from '@isaias_pv/custos-sdk';

export const authGuard = () => {
  const router = inject(Router);
  
  // Obtener instancia del SDK (debes tenerla en un servicio)
  const auth = inject(AuthService).auth;

  if (auth.isAuthenticated()) {
    return true;
  }

  router.navigate(['/auth/sign-in']);
  return false;
};
```

## auth.service.ts (Servicio Singleton)

```typescript
import { Injectable } from '@angular/core';
import { Custos } from '@isaias_pv/custos-sdk';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  public auth: Custos;

  constructor() {
    this.auth = new Custos({
      clientId: environment.client_id,
      redirectUri: environment.redirect_uri + '/#/auth/sign-in',
      apiUrl: environment.url_auth,
      scope: environment.scope,
      usePKCE: true,
    });
  }

  // Métodos helper
  isAuthenticated(): boolean {
    return this.auth.isAuthenticated();
  }

  getUser() {
    return this.auth.getUser();
  }

  getAccessToken() {
    return this.auth.getAccessToken();
  }

  async login() {
    await this.auth.login();
  }

  async logout() {
    await this.auth.logout();
  }
}
```

## HTTP Interceptor (Para agregar token automáticamente)

```typescript
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getAccessToken();

  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(req);
};
```

## app.config.ts

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([authInterceptor])
    )
  ]
};
```

---

## Beneficios de Usar el SDK

### Antes (Código Manual)
- ❌ ~200 líneas de código OAuth
- ❌ Manejo manual de PKCE
- ❌ Gestión manual de tokens
- ❌ Timer de expiración manual
- ❌ Manejo manual de errores
- ❌ Código duplicado en múltiples componentes

### Después (Con SDK)
- ✅ ~50 líneas de código
- ✅ PKCE automático
- ✅ Refresh automático de tokens
- ✅ Event system integrado
- ✅ Gestión centralizada
- ✅ Reutilizable en toda la app

---

## Migrando tu Código Actual

### Paso 1: Instalar SDK actualizado
```bash
npm install @isaias_pv/custos-sdk@latest
```

### Paso 2: Crear AuthService
Copia el código del `auth.service.ts` de arriba

### Paso 3: Simplificar SignInComponent
Reemplaza todo el código OAuth manual con las ~50 líneas del ejemplo

### Paso 4: Remover código innecesario
- `generateCodeVerifier()`
- `generateCodeChallenge()`
- `base64UrlEncode()`
- `exchangeCodeForToken()`
- `setupTokenExpiryTimer()`
- Todo el manejo manual de tokens

### Paso 5: Agregar Interceptor
Para inyectar automáticamente el Bearer token

---

¿Quieres que te ayude a migrar alguna parte específica de tu código actual al SDK?
