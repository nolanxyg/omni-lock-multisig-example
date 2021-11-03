/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['packages'],
  testMatch: ['<rootDir>/**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.build.json',
      babelConfig: true,
    },
  }
};