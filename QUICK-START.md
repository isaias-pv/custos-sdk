# 🚀 Guía Rápida de Implementación - Custos SDK Corregido

## 📦 Archivos Incluidos

```
custos-sdk-fixed/
├── Custos.ts                  # ⭐ Clase principal del SDK
├── storage.ts                 # 💾 Manejo de localStorage
├── api.ts                     # 🌐 Cliente API
├── utils.ts                   # 🔧 Utilidades (PKCE, parsers)
├── types.ts                   # 📝 Tipos TypeScript
├── index.ts                   # 📍 Punto de entrada
├── package.json               # 📦 Config NPM
├── tsconfig.json              # ⚙️ Config TypeScript
├── README.md                  # 📖 Documentación completa
├── MIGRATION-GUIDE.md         # 📋 Guía de migración
└── sign-in.component.ts       # 🎯 Implementación en Angular
```

## 🎯 Implementación en 5 Pasos

### Paso 1️⃣: Copiar Archivos del SDK

**Opción A: Usar como paquete local**
```bash
# Crear directorio para el SDK
mkdir -p src/sdk/custos

# Copiar archivos del SDK
cp custos-sdk-fixed/{Custos,storage,api,utils,types,index}.ts src/sdk/custos/
```

**Opción B: Publicar como paquete NPM**
```bash
cd custos-sdk-fixed
npm install
npm run build
npm publish
```

### Paso 2️⃣: Actualizar sign-in.component.ts

Reemplaza tu componente actual con:
```typescript
// Copiar: custos-sdk-fixed/sign-in.component.ts
```

**Cambios clave en el import:**
```typescript
// Si usaste Opción A (local):
import { Custos } from 'src/sdk/custos';

// Si usaste Opción B (NPM):
import { Custos } from '@alim/custos';
```

### Paso 3️⃣: Verificar Configuración de Capacitor

**capacitor.config.ts:**
```typescript
const config: CapacitorConfig = {
  appId: 'com.alimzen.numi',
  plugins: {  // ⚠️ DEBE SER PLURAL "plugins"
    App: {}
  },
  android: {
    intentFilters: [{
      action: 'VIEW',
      category: ['BROWSABLE', 'DEFAULT'],
      data: [{ 
        scheme: 'numi', 
        host: 'auth', 
        pathPrefix: '/callback' 
      }]
    }]
  }
};
```

**iOS - Info.plist:**
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array><string>numi</string></array>
  </dict>
</array>
```

### Paso 4️⃣: Registrar Redirect URIs en Custos Backend

Asegúrate de tener estos URIs registrados:

```
✅ http://localhost:8100/auth/sign-in       (desarrollo)
✅ https://numi.alimzen.com/auth/callback   (producción web)
✅ numi://auth/callback                      (iOS/Android)
```

### Paso 5️⃣: Probar el Flujo Completo

**Test en Web (Desarrollo):**
```bash
ionic serve
# Navegar a http://localhost:8100/auth/sign-in
# Click en "Continuar con Custos"
# Autenticarse
# Verificar que redirige correctamente
```

**Test en Dispositivo Nativo:**
```bash
# iOS
ionic cap run ios

# Android
ionic cap run android
```

## 🔍 Verificación del Flujo

### Logs Esperados (Consola)

```
🔑 Starting login flow
  State: abc123...
💾 Saved state: oauth_state
💾 Saved state: code_verifier
🚀 Redirecting to: https://custos.alimzen.com/...

[Después del redirect con ?code=... en URL]

🔍 handleCallback() called
  Callback params: {hasCode: true, hasState: true}
✅ Authorization code found
🔍 State validation:
  Received: abc123
  Saved: abc123
  Match: true
🔐 PKCE code_verifier: true
📡 API Request: POST https://custos.alimzen.com/api/v1/auth/token
📡 API Response: 200 OK
✅ Tokens received
📡 API Request: GET https://custos.alimzen.com/api/v1/system/users/profile
✅ User info received: user@example.com
🧹 PKCE data cleaned up
🎉 Login successful!
```

### Verificar localStorage (Navegador)

Abrir DevTools → Console:
```javascript
// Ver datos guardados:
console.log('State:', localStorage.getItem('custos_oauth_state'));
console.log('Verifier:', localStorage.getItem('custos_code_verifier'));
console.log('Tokens:', localStorage.getItem('custos_tokens'));
console.log('User:', localStorage.getItem('custos_user'));
```

## 🐛 Troubleshooting

### ❌ Error: "State parameter mismatch"

**Causa:** localStorage no está persistiendo entre sesiones

**Solución:**
```typescript
// Verificar que useSessionStorage sea false:
this.auth = new Custos({
  // ...
  useSessionStorage: false  // ⚠️ DEBE SER FALSE
});
```

### ❌ Error: "Code verifier not found"

**Causa:** El code_verifier no se guardó correctamente

**Solución:**
```javascript
// Verificar en consola ANTES de autenticar:
console.log('Verifier guardado:', localStorage.getItem('custos_code_verifier'));

// Si es null, el problema está en el login(), no en el callback
```

### ❌ Error: "Invalid state parameter"

**Causa:** El state recibido no coincide con el guardado

**Solución:**
```javascript
// Limpiar localStorage y reintentar:
localStorage.removeItem('custos_oauth_state');
localStorage.removeItem('custos_code_verifier');
localStorage.removeItem('custos_code_challenge');

// Hacer login nuevamente
```

### ❌ Redirect URI mismatch

**Causa:** El redirect_uri no está registrado en Custos

**Solución:**
1. Ir a Custos Dashboard
2. Configurar la aplicación
3. Agregar todos los redirect URIs:
   - `http://localhost:8100/auth/sign-in`
   - `https://numi.alimzen.com/auth/callback`
   - `numi://auth/callback`

### ❌ Deep link no funciona en iOS

**Solución:**
```bash
# Verificar configuración:
cat ios/App/App/Info.plist | grep -A 5 CFBundleURLTypes

# Debe mostrar:
# <key>CFBundleURLSchemes</key>
# <array><string>numi</string></array>

# Si no está, editar Info.plist y agregar manualmente
```

### ❌ Deep link no funciona en Android

**Solución:**
```bash
# Verificar capacitor.config.ts tiene "plugins" (plural)
# Ejecutar sync:
ionic cap sync android

# Verificar AndroidManifest.xml:
cat android/app/src/main/AndroidManifest.xml | grep -A 10 "android.intent.action.VIEW"
```

## 📊 Checklist de Implementación

- [ ] ✅ Archivos del SDK copiados a `src/sdk/custos/`
- [ ] ✅ `sign-in.component.ts` actualizado
- [ ] ✅ Import del SDK corregido (local o NPM)
- [ ] ✅ `capacitor.config.ts` tiene `plugins` (plural)
- [ ] ✅ iOS: `Info.plist` configurado con URL scheme
- [ ] ✅ Android: intent filters verificados
- [ ] ✅ Redirect URIs registrados en Custos backend
- [ ] ✅ Test web: Login funciona ✓
- [ ] ✅ Test iOS: Deep link funciona ✓
- [ ] ✅ Test Android: Deep link funciona ✓
- [ ] ✅ Tokens persisten entre recargas ✓
- [ ] ✅ Refresh automático funciona ✓
- [ ] ✅ Logout funciona ✓

## 🎓 Recursos de Ayuda

1. **README completo:** `custos-sdk-fixed/README.md`
2. **Guía de migración:** `custos-sdk-fixed/MIGRATION-GUIDE.md`
3. **Código de ejemplo:** `custos-sdk-fixed/sign-in.component.ts`

## 💡 Tips Importantes

### ⚠️ CRÍTICO: useSessionStorage SIEMPRE false

```typescript
// ❌ NUNCA hacer esto:
new Custos({ useSessionStorage: true });

// ✅ SIEMPRE hacer esto:
new Custos({ useSessionStorage: false });
```

**¿Por qué?** sessionStorage se pierde cuando:
- Cierras el tab/ventana
- Abres una nueva tab
- En apps nativas: cuando el navegador del sistema se cierra

### ⚠️ CRÍTICO: Llamar handleCallback() explícitamente

```typescript
// ❌ NUNCA confiar en auto-handling:
// (Ya no existe en la nueva versión)

// ✅ SIEMPRE manejar explícitamente:
ngOnInit() {
  this.route.queryParams.subscribe(async params => {
    if (params['code']) {
      await this.auth.handleCallback();
    }
  });
}
```

### ⚠️ CRÍTICO: Verificar logs para debugging

El SDK ahora loggea TODO. Si algo falla, revisa la consola:
```javascript
// Los logs te dirán exactamente dónde está el problema:
// ✅ State saved: ✓
// ✅ Code verifier saved: ✓
// ❌ No saved state found: ✗
```

## 🎉 ¡Listo!

Si seguiste todos los pasos, tu autenticación OAuth con Custos debe estar funcionando perfectamente en:
- ✅ Web (desarrollo y producción)
- ✅ iOS (con deep linking)
- ✅ Android (con deep linking)

¿Problemas? Revisa la sección de Troubleshooting o consulta los logs en consola.

¡Feliz desarrollo! 🚀
