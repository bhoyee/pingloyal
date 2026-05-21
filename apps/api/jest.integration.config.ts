import type { Config } from 'jest';

const moduleNameMapper = {
  '^@pingloyal/types$': '<rootDir>/../../packages/types/src/index.ts',
  '^@pingloyal/types/(.*)$': '<rootDir>/../../packages/types/src/$1',
  '^@pingloyal/utils$': '<rootDir>/../../packages/utils/src/index.ts',
  '^@pingloyal/utils/(.*)$': '<rootDir>/../../packages/utils/src/$1',
  '^@pingloyal/zod-schemas$': '<rootDir>/../../packages/zod-schemas/src/index.ts',
  '^@pingloyal/zod-schemas/(.*)$': '<rootDir>/../../packages/zod-schemas/src/$1',
};

// Switch to CommonJS + plain Node resolution so ts-jest can handle the
// nodenext source files without triggering nodenext-only compiler flags.
const tsJestTransform = {
  '^.+\\.(t|j)s$': [
    'ts-jest',
    {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        resolvePackageJsonExports: false,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    },
  ],
};

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
  transform: tsJestTransform,
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage/integration',
  testEnvironment: 'node',
  moduleNameMapper,
  // runInBand is passed as CLI flag (--runInBand), not via config
  testTimeout: 60000,
};

export default config;
