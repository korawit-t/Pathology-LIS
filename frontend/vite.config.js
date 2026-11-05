import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))

// Changes on every build, even when the version number doesn't, so a tab left
// open across a redeploy can tell it is running old code
// (src/hooks/useNewBuildAvailable.ts compares it with /version.json).
const buildId = new Date().toISOString()

// Writes version.json next to index.html. Served as a plain static file by
// IIS, nginx and `vite preview`; the dev server has none, and the check is off
// there.
const versionFile = () => ({
  name: 'version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version, buildId }),
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionFile()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_ID__: JSON.stringify(buildId),
  },
})
