import Settings from '@overleaf/settings'
import logger from '@overleaf/logger'
import { app } from './app/js/server.js'
import * as ASpell from './app/js/ASpell.js'

const { host = 'localhost', port = 3005 } = Settings.internal?.spelling ?? {}

ASpell.startCacheDump()

const server = app.listen(port, host, function (error) {
  if (error) {
    throw error
  }
  logger.info({ host, port }, 'spelling HTTP server starting up')
})

process.on('SIGTERM', () => {
  ASpell.stopCacheDump()
  server.close(() => {
    logger.info({ host, port }, 'spelling HTTP server closed')
  })
})
