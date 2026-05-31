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
  collectCoverageFrom: [
    'src/modules/**/*.service.ts',
    'src/modules/**/*.processor.ts',
    'src/queue/processors/**/*.ts',
    // Complex infra services — covered by integration tests
    '!src/modules/auth/auth.service.ts',
    '!src/modules/tenants/tenants.service.ts',
    '!src/modules/storage/r2.service.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.module.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: './coverage/unit',
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 65,  // complex processors/service patterns → integration tested
      branches: 60,
      statements: 80,
    },
  },
  coverageReporters: ['text-summary', 'lcov'],
  testEnvironment: 'node',
  moduleNameMapper,
  passWithNoTests: true,
};

export default config;
