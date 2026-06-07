import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

type LogLevel = 'info' | 'warn' | 'error'

export function pelletTownDevLogPlugin(): Plugin {
  return {
    name: 'pellet-town-dev-log',
    configureServer(server) {
      server.middlewares.use('/__pellet-town/log', (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        let body = ''
        req.on('data', (chunk: Buffer | string) => {
          body += chunk.toString()
        })
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as {
              level?: LogLevel
              message?: string
              data?: Record<string, unknown>
            }
            const level = parsed.level ?? 'info'
            const message = parsed.message ?? '(no message)'
            const suffix = parsed.data ? ` ${JSON.stringify(parsed.data)}` : ''
            const line = `[pellet-town][${level}] ${message}${suffix}`

            if (level === 'error') console.error(line)
            else if (level === 'warn') console.warn(line)
            else console.log(line)
          } catch (error) {
            console.error('[pellet-town][error] Failed to parse dev log payload', error)
          }

          ;(res as ServerResponse).statusCode = 204
          ;(res as ServerResponse).end()
        })
      })
    },
  }
}

function overpassProxyLog(label: string) {
  return {
    configure: (proxy: {
      on: (event: string, listener: (...args: unknown[]) => void) => void
    }) => {
      proxy.on('proxyReq', (_proxyReq, req) => {
        const request = req as IncomingMessage
        console.log(`[pellet-town][overpass][${label}] → ${request.method} ${request.url}`)
      })
      proxy.on('proxyRes', (proxyRes, req) => {
        const request = req as IncomingMessage
        const status = (proxyRes as { statusCode?: number }).statusCode
        console.log(`[pellet-town][overpass][${label}] ← ${status} ${request.url}`)
      })
      proxy.on('error', (err, req) => {
        const request = req as IncomingMessage
        console.error(
          `[pellet-town][overpass][${label}] proxy error ${(err as Error).message} ${request.url ?? ''}`,
        )
      })
    },
  }
}

export const overpassDevProxy = {
  '/overpass/de': {
    target: 'https://overpass-api.de',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/overpass\/de/, ''),
    ...overpassProxyLog('de'),
  },
  '/overpass/kumi': {
    target: 'https://overpass.kumi.systems',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/overpass\/kumi/, ''),
    ...overpassProxyLog('kumi'),
  },
}
