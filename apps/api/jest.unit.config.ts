import type { Config } from 'jest';

const moduleNameMapper = {
  '^@pingloyal/types$': '<rootDir>/../../packages/types/src/index.ts',
  '^@pingloyal/types/(.*)$': '<rootDir>/../../packages/types/src/$1',
  '^@pingloyal/utils$': '<rootDir>/../../packages/utils/src/index.ts',
  '^@pingloyal/utils/(.*)$': '<rootDir>/../../packages/utils/src/$1',
  '^@pingloyal/zod-schemas$': '<rootDir>/../../packages/zod-schemas/src/index.ts',
  '^@pingloyal/zod-schemas/(.*)$': '<rootDir>/../../packages/zod-schemas/src/$1',
};

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
  testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
  transform: tsJestTransform,
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage/unit',
  coverageThreshold: { global: { lines: 80 } },
  testEnvironment: 'node',
  moduleNameMapper,
};

export default config;
