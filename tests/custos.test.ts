import { Custos } from '../src/Custos';

describe('Custos SDK', () => {
	it('should instantiate correctly', () => {
		const custos = new Custos({
			clientId: 'test-client-id',
			redirectUri: 'http://localhost:3000/callback',
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