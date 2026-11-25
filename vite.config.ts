import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

// A change in these top-level folders sends a full reload to every open page, and a
// reload discards a transcribe run in progress. Agent worktrees, the spec renderer,
// builds and test reports write here.
const unwatchedFolders = new Set([
  '.claude',
  'dist',
  'docs',
  'vendor',
  'playwright-report',
  'test-results',
])

/**
 * Returns true when a path is inside one of the unwatched folders of this project.
 * The match uses the path relative to the project root, because a glob such as
 * `**\/.claude/**` also matches every file of a checkout that is itself under
 * `.claude/worktrees/`, and then the dev server sees no source change at all.
 */
function isUnwatched(filePath: string): boolean {
  const relativePath = path.relative(projectRoot, filePath)
  return unwatchedFolders.has(relativePath.split(path.sep)[0])
}

/**
 * Returns the short git commit of the build, so that a run report names the version of the app that made it.
 * CI sets GITHUB_SHA. A local build reads the commit from git. A folder with no git gives 'dev'.
 */
function buildId(): string {
  const sha = process.env.GITHUB_SHA
  if (sha !== undefined && sha !== '') return sha.slice(0, 7)
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return 'dev'
  }
}

// The two headers make the page cross-origin isolated, so the speech model can use more than one CPU thread.
// See docs/adr/0006-cross-origin-isolation-for-wasm-threads.md. infra/hosting.yml sends the same values.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react()],
  // Vite replaces the name in the build and defines it as a global in dev and in the unit tests.
  define: { __APP_BUILD__: JSON.stringify(buildId()) },
  server: {
    port: 5173,
    // The documented local URL is http://localhost:5173, so a busy port is an error.
    strictPort: true,
    // Vite adds this matcher to its own defaults (.git, node_modules, test-results and
    // the cache directory); it does not replace them.
    watch: { ignored: [isUnwatched] },
    headers: isolationHeaders,
  },
  preview: { headers: isolationHeaders },
  // The default format 'iife' puts a dynamic import into the worker file, so the Demucs engine would load with Spleeter.
  // The measurement build of issue #117 used 'es' and ran the speech model and Demucs in Chromium and Firefox.
  worker: { format: 'es' },
})
