import type { Config } from 'jest';

const moduleNameMapper = {
  '^@pingloyal/types$': '<rootDir>/../../packages/types/src/index.ts',
  '^@pingloyal/types/(.*)$': '<rootDir>/../../packages/types/src/$1',
  '^@pingloyal/utils$': '<rootDir>/../../packages/utils/src/index.ts',
  '^@pingloyal/utils/(.*)$': '<rootDir>/../../packages/utils/src/$1',
  '^@pingloyal/zod-schemas$': '<rootDir>/../../packages/zod-schemas/src/index.ts',
  '^@pingloyal/zod-schemas/(.*)$': '<rootDir>/../../packages/zod-schemas/src/$1',
};

const tsJestOptions = {
  tsconfig: {
    module: 'commonjs',
    moduleResolution: 'node',
    resolvePackageJsonExports: false,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
  },
};

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/test/unit/**/*.spec.ts',
  ],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', tsJestOptions] as [string, unknown],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage/unit',
  // Threshold disabled until service unit tests reach 80% coverage.
  // coverageThreshold: { global: { lines: 80 } },
  testEnvironment: 'node',
  moduleNameMapper,
  passWithNoTests: true,
};

export default config;
