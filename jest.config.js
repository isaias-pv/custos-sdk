module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'jsdom',
	setupFiles: ['./tests/setup.ts'],
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