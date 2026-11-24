import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      coverage: {
        enabled: true,
        provider: 'v8',
        // The spec sets the coverage threshold for the pure logic and the store only.
        include: ['src/lib/**/*.ts', 'src/store/**/*.ts'],
        exclude: ['**/*.test.ts'],
        reporter: ['text', 'html'],
        thresholds: { lines: 90 },
      },
    },
  }),
)
