import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { overpassDevProxy, pelletTownDevLogPlugin } from './vite-plugins/dev-log'

// GitHub project pages are served at https://<user>.github.io/<repo>/
const repoName = 'pellet-town'
const githubPagesBase = `/${repoName}/`

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? githubPagesBase : '/',
  plugins: [react(), pelletTownDevLogPlugin()],
  worker: {
    format: 'es',
  },
  server: {
    proxy: overpassDevProxy,
  },
})
