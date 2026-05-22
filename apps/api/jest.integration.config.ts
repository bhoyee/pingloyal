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
  testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', tsJestOptions] as [string, unknown],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage/integration',
  testEnvironment: 'node',
  moduleNameMapper,
  // runInBand is passed as CLI flag (--runInBand), not via config
  testTimeout: 60000,
};

export default config;
