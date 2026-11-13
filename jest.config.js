/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Gesture handler's own mocks of its native module, so components with gestures render.
  setupFiles: ['react-native-gesture-handler/jestSetup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Mirror the tsconfig path aliases (Metro resolves these natively; Jest needs to be told).
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/', '/.maestro/', '/.artifacts/'],
  clearMocks: true,
};
