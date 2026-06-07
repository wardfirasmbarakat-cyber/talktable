// server.ts
// Custom Next.js server that attaches Socket.io
// Start with: npx tsx server.ts (dev) or node dist/server.js (prod)

import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { initSocket } from './src/lib/socket-server'

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME ?? 'localhost'
const port = parseInt(process.env.PORT ?? '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? '/', true)
    handle(req, res, parsedUrl)
  })

  // Attach Socket.io
  initSocket(httpServer)

  httpServer.listen(port, hostname, () => {
    console.log(`✅ TalkTable ready on http://${hostname}:${port}`)
    console.log(`   Environment: ${dev ? 'development' : 'production'}`)
    console.log(`   Socket.io: attached`)
  })
})
