module.exports = {
  mongo: {
    url:
      process.env.MONGO_CONNECTION_STRING ||
      `mongodb://${process.env.MONGO_HOST || 'localhost'}/sharelatex`,
  },
  internal: {
    history: {
      port: 3054,
      host: process.env.LISTEN_ADDRESS || 'localhost',
    },
  },
  apis: {
    documentupdater: {
      url: `http://${process.env.DOCUPDATER_HOST || 'localhost'}:3003`,
    },
    docstore: {
      url: `http://${process.env.DOCSTORE_HOST || 'localhost'}:3016`,
    },
    filestore: {
      url: `http://${process.env.FILESTORE_HOST || 'localhost'}:3009`,
    },
    web: {
      url: `http://${
        process.env.WEB_API_HOST || process.env.WEB_HOST || 'localhost'
      }:${process.env.WEB_PORT || 3000}`,
      user: process.env.WEB_API_USER || 'sharelatex',
      pass: process.env.WEB_API_PASSWORD || 'password',
      historyIdCacheSize: parseInt(
        process.env.HISTORY_ID_CACHE_SIZE || '10000',
        10
      ),
    },
  },
  redis: {
    lock: {
      host: process.env.REDIS_HOST || 'localhost',
      password: process.env.REDIS_PASSWORD,
      port: process.env.REDIS_PORT || 6379,
      key_schema: {
        projectHistoryLock({ project_id: projectId }) {
          return `ProjectHistoryLock:{${projectId}}`
        },
      },
    },
    project_history: {
      host:
        process.env.HISTORY_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
      port: process.env.HISTORY_REDIS_PORT || process.env.REDIS_PORT || 6379,
      password:
        process.env.HISTORY_REDIS_PASSWORD || process.env.REDIS_PASSWORD,
      key_schema: {
        projectHistoryOps({ project_id: projectId }) {
          return `ProjectHistory:Ops:{${projectId}}`
        },
        projectHistoryFirstOpTimestamp({ project_id: projectId }) {
          return `ProjectHistory:FirstOpTimestamp:{${projectId}}`
        },
        projectHistoryCachedHistoryId({ project_id: projectId }) {
          return `ProjectHistory:CachedHistoryId:{${projectId}}`
        },
      },
    },
  },

  history: {
    healthCheck: {
      project_id: process.env.HEALTH_CHECK_PROJECT_ID || '',
    },
  },

  overleaf: {
    history: {
      host:
        process.env.V1_HISTORY_FULL_HOST ||
        `http://${
          process.env.V1_HISTORY_HOST ||
          process.env.HISTORY_V1_HOST ||
          'localhost'
        }:3100/api`,
      user: process.env.V1_HISTORY_USER || 'staging',
      pass: process.env.V1_HISTORY_PASSWORD || 'password',
      sync: {
        retries_max: 30,
        interval: 2,
      },
    },
  },

  path: {
    uploadFolder: process.env.UPLOAD_FOLDER || '/tmp/',
  },

  sentry: {
    dsn: process.env.SENTRY_DSN,
  },

  maxFileSizeInBytes: 100 * 1024 * 1024, // 100 megabytes
}
