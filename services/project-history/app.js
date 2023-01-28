import Settings from '@overleaf/settings'
import logger from '@overleaf/logger'
import OError from '@overleaf/o-error'
import { mongoClient } from './app/js/mongodb.js'
import { app } from './app/js/server.js'

const host = Settings.internal.history.host
const port = Settings.internal.history.port

mongoClient
  .connect()
  .then(() => {
    app.listen(port, host, error => {
      if (error != null) {
        logger.error(OError.tag(error, 'could not start history server'))
      } else {
        logger.debug(`history starting up, listening on ${host}:${port}`)
      }
    })
  })
  .catch(err => {
    logger.fatal({ err }, 'Cannot connect to mongo. Exiting.')
    process.exit(1)
  })
