module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'jsdom',
	roots: ['<rootDir>/tests'],
	testMatch: ['**/*.test.ts'],
	moduleFileExtensions: ['ts', 'js'],
	collectCoverage: false,
	coverageDirectory: 'coverage',
	collectCoverageFrom: [
		'src/**/*.ts',
		'!src/**/*.d.ts',
	],
};