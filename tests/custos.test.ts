import { Custos } from '../src/Custos';

describe('Custos SDK', () => {
	it('should instantiate correctly', () => {
		const custos = new Custos({
			clientId: 'test-client-id',
			redirectUri: 'http://localhost:3000/callback',
		});

		const redirectUri = 'http://localhost:8100/auth/sign-in';

		const baseUrl = 'https://custos.alimzen.com';

		// Inicializar SDK
		const auth = new Custos({
			clientId: 'app_170f5106a724205d23641b36c171d446',
			redirectUri: redirectUri,
			apiUrl: baseUrl,
			scope: 'openid profile email',
			usePKCE: true,
			codeChallengeMethod: 'S256'
		});

		auth.on('login', async (event) => {
			const { user, tokens } = event.data;

			console.log('✅ Usuario autenticado:', user);
			console.log('Tokens:', tokens);
		});

		// ❌ Error de autenticación
		auth.on('error', (event) => {
			const error = event.data;
			console.error('❌ Error de autenticación:', error);
		});

		// ⏱️ Token expirado
		auth.on('token-expired', () => {
			console.warn('⏱️ Token expirado, intentando refrescar...');
		});

		// 🔄 Token actualizado (refresh automático)
		auth.on('token-refresh', (event) => {
			const tokens = event.data;
			console.log('✅ Token actualizado automáticamente:', tokens);
		});

		expect(custos).toBeDefined();
		expect(custos.isAuthenticated()).toBe(false);
	});

	it('should get user when not authenticated', () => {
		const custos = new Custos({
			clientId: 'test-client-id',
			redirectUri: 'http://localhost:3000/callback',
		});

		const user = custos.getUser();
		expect(user).toBeNull();
	});
});