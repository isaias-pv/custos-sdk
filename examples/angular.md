# Angular Example (Current SDK)

This example uses the current SDK flow:

- explicit callback handling with `hasCallbackParams()` + `handleCallback()`
- bootstrap restore with `silentAuth()`
- event listeners (`login`, `error`, `session-restored`, `logout`)

## auth.service.ts

```ts
import { Injectable } from '@angular/core';
import { Custos } from '@isaias_pv/custos-sdk';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly auth = new Custos({
    clientId: 'your-client-id',
    redirectUri: window.location.origin + '/auth/callback',
    apiUrl: 'https://custos.alimzen.com',
    scope: 'openid profile email',
    usePKCE: true,
    useSessionStorage: false,
  });

  initListeners(): void {
    this.auth.on('login', ({ data }) => {
      console.log('login', data.user);
    });

    this.auth.on('session-restored', ({ data }) => {
      console.log('restored', data.user);
    });

    this.auth.on('error', ({ data }) => {
      console.error('auth error', data);
    });

    this.auth.on('logout', () => {
      console.log('logout');
    });
  }
}
```

## app.component.ts (bootstrap)

```ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  template: '<router-outlet></router-outlet>',
})
export class AppComponent implements OnInit {
  constructor(private authService: AuthService, private router: Router) {}

  async ngOnInit(): Promise<void> {
    this.authService.initListeners();

    const restored = await this.authService.auth.silentAuth();
    if (restored) {
      // optional: this.router.navigate(['/dashboard']);
    }
  }
}
```

## auth-callback.component.ts

```ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-auth-callback',
  template: '<p>Completing sign in...</p>',
})
export class AuthCallbackComponent implements OnInit {
  constructor(private authService: AuthService, private router: Router) {}

  async ngOnInit(): Promise<void> {
    try {
      if (this.authService.auth.hasCallbackParams()) {
        await this.authService.auth.handleCallback();
      }
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error(error);
      this.router.navigate(['/login']);
    }
  }
}
```

## login.component.ts

```ts
import { Component } from '@angular/core';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login',
  template: `
    <button (click)="login()">Sign in with Custos</button>
  `,
})
export class LoginComponent {
  constructor(private authService: AuthService) {}

  async login(): Promise<void> {
    await this.authService.auth.login();
  }

  async logout(): Promise<void> {
    await this.authService.auth.logout();
  }
}
```
