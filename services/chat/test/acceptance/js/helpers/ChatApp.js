import { createServer } from '../../../../app/js/server.js'
import { promisify } from 'util'

export { db } from '../../../../app/js/mongodb.js'

let serverPromise = null

export async function ensureRunning() {
  if (!serverPromise) {
    const { app } = await createServer()
    const startServer = promisify(app.listen.bind(app))
    serverPromise = startServer(3010, 'localhost')
  }
  return serverPromise
}
