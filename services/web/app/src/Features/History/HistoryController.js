let HistoryController
const OError = require('@overleaf/o-error')
const async = require('async')
const logger = require('@overleaf/logger')
const request = require('request')
const settings = require('@overleaf/settings')
const SessionManager = require('../Authentication/SessionManager')
const UserGetter = require('../User/UserGetter')
const Errors = require('../Errors/Errors')
const HistoryManager = require('./HistoryManager')
const ProjectDetailsHandler = require('../Project/ProjectDetailsHandler')
const ProjectEntityUpdateHandler = require('../Project/ProjectEntityUpdateHandler')
const RestoreManager = require('./RestoreManager')
const { pipeline } = require('stream')
const { prepareZipAttachment } = require('../../infrastructure/Response')
const Features = require('../../infrastructure/Features')

module.exports = HistoryController = {
  selectHistoryApi(req, res, next) {
    const { Project_id: projectId } = req.params
    // find out which type of history service this project uses
    ProjectDetailsHandler.getDetails(projectId, function (err, project) {
      if (err) {
        return next(err)
      }
      const history = project.overleaf && project.overleaf.history
      if (history && history.id && history.display) {
        req.useProjectHistory = true
      } else {
        req.useProjectHistory = false
      }
      next()
    })
  },

  ensureProjectHistoryEnabled(req, res, next) {
    if (req.useProjectHistory) {
      next()
    } else {
      res.sendStatus(404)
    }
  },

  proxyToHistoryApi(req, res, next) {
    const userId = SessionManager.getLoggedInUserId(req.session)
    const url =
      HistoryController.buildHistoryServiceUrl(req.useProjectHistory) + req.url

    const getReq = request({
      url,
      method: req.method,
      headers: {
        'X-User-Id': userId,
      },
    })
    pipeline(getReq, res, function (err) {
      if (err) {
        logger.warn({ url, err }, 'history API error')
        next(err)
      }
    })
  },

  proxyToHistoryApiAndInjectUserDetails(req, res, next) {
    const userId = SessionManager.getLoggedInUserId(req.session)
    const url =
      HistoryController.buildHistoryServiceUrl(req.useProjectHistory) + req.url
    HistoryController._makeRequest(
      {
        url,
        method: req.method,
        json: true,
        headers: {
          'X-User-Id': userId,
        },
      },
      function (err, body) {
        if (err) {
          return next(err)
        }
        HistoryManager.injectUserDetails(body, function (err, data) {
          if (err) {
            return next(err)
          }
          res.json(data)
        })
      }
    )
  },

  buildHistoryServiceUrl(useProjectHistory) {
    // choose a history service, either document-level (trackchanges)
    // or project-level (project_history)
    if (useProjectHistory) {
      return settings.apis.project_history.url
    } else {
      return settings.apis.trackchanges.url
    }
  },

  resyncProjectHistory(req, res, next) {
    // increase timeout to 6 minutes
    res.setTimeout(6 * 60 * 1000)
    const projectId = req.params.Project_id
    ProjectEntityUpdateHandler.resyncProjectHistory(projectId, function (err) {
      if (err instanceof Errors.ProjectHistoryDisabledError) {
        return res.sendStatus(404)
      }
      if (err) {
        return next(err)
      }
      res.sendStatus(204)
    })
  },

  restoreFileFromV2(req, res, next) {
    const { project_id: projectId } = req.params
    const { version, pathname } = req.body
    const userId = SessionManager.getLoggedInUserId(req.session)
    RestoreManager.restoreFileFromV2(
      userId,
      projectId,
      version,
      pathname,
      function (err, entity) {
        if (err) {
          return next(err)
        }
        res.json({
          type: entity.type,
          id: entity._id,
        })
      }
    )
  },

  restoreDocFromDeletedDoc(req, res, next) {
    const { project_id: projectId, doc_id: docId } = req.params
    const { name } = req.body
    const userId = SessionManager.getLoggedInUserId(req.session)
    if (name == null) {
      return res.sendStatus(400) // Malformed request
    }
    RestoreManager.restoreDocFromDeletedDoc(
      userId,
      projectId,
      docId,
      name,
      (err, doc) => {
        if (err) return next(err)
        res.json({
          doc_id: doc._id,
        })
      }
    )
  },

  getLabels(req, res, next) {
    const projectId = req.params.Project_id
    HistoryController._makeRequest(
      {
        method: 'GET',
        url: `${settings.apis.project_history.url}/project/${projectId}/labels`,
        json: true,
      },
      function (err, labels) {
        if (err) {
          return next(err)
        }
        HistoryController._enrichLabels(labels, (err, labels) => {
          if (err) {
            return next(err)
          }
          res.json(labels)
        })
      }
    )
  },

  createLabel(req, res, next) {
    const projectId = req.params.Project_id
    const { comment, version } = req.body
    const userId = SessionManager.getLoggedInUserId(req.session)
    HistoryController._makeRequest(
      {
        method: 'POST',
        url: `${settings.apis.project_history.url}/project/${projectId}/user/${userId}/labels`,
        json: { comment, version },
      },
      function (err, label) {
        if (err) {
          return next(err)
        }
        HistoryController._enrichLabel(label, (err, label) => {
          if (err) {
            return next(err)
          }
          res.json(label)
        })
      }
    )
  },

  _enrichLabel(label, callback) {
    if (!label.user_id) {
      return callback(null, label)
    }
    UserGetter.getUser(
      label.user_id,
      { first_name: 1, last_name: 1, email: 1 },
      (err, user) => {
        if (err) {
          return callback(err)
        }
        const newLabel = Object.assign({}, label)
        newLabel.user_display_name = HistoryController._displayNameForUser(user)
        callback(null, newLabel)
      }
    )
  },

  _enrichLabels(labels, callback) {
    if (!labels || !labels.length) {
      return callback(null, [])
    }
    const uniqueUsers = new Set(labels.map(label => label.user_id))

    // For backwards compatibility expect missing user_id fields
    uniqueUsers.delete(undefined)

    if (!uniqueUsers.size) {
      return callback(null, labels)
    }

    UserGetter.getUsers(
      Array.from(uniqueUsers),
      { first_name: 1, last_name: 1, email: 1 },
      function (err, rawUsers) {
        if (err) {
          return callback(err)
        }
        const users = new Map(rawUsers.map(user => [String(user._id), user]))

        labels.forEach(label => {
          const user = users.get(label.user_id)
          if (!user) return
          label.user_display_name = HistoryController._displayNameForUser(user)
        })
        callback(null, labels)
      }
    )
  },

  _displayNameForUser(user) {
    if (user == null) {
      return 'Anonymous'
    }
    if (user.name) {
      return user.name
    }
    let name = [user.first_name, user.last_name]
      .filter(n => n != null)
      .join(' ')
      .trim()
    if (name === '') {
      name = user.email.split('@')[0]
    }
    if (!name) {
      return '?'
    }
    return name
  },

  deleteLabel(req, res, next) {
    const { Project_id: projectId, label_id: labelId } = req.params
    const userId = SessionManager.getLoggedInUserId(req.session)
    HistoryController._makeRequest(
      {
        method: 'DELETE',
        url: `${settings.apis.project_history.url}/project/${projectId}/user/${userId}/labels/${labelId}`,
      },
      function (err) {
        if (err) {
          return next(err)
        }
        res.sendStatus(204)
      }
    )
  },

  _makeRequest(options, callback) {
    return request(options, function (err, response, body) {
      if (err) {
        return callback(err)
      }
      if (response.statusCode >= 200 && response.statusCode < 300) {
        callback(null, body)
      } else {
        err = new Error(
          `history api responded with non-success code: ${response.statusCode}`
        )
        callback(err)
      }
    })
  },

  downloadZipOfVersion(req, res, next) {
    const { project_id: projectId, version } = req.params
    ProjectDetailsHandler.getDetails(projectId, function (err, project) {
      if (err) {
        return next(err)
      }
      const v1Id =
        project.overleaf &&
        project.overleaf.history &&
        project.overleaf.history.id
      if (v1Id == null) {
        logger.error(
          { projectId, version },
          'got request for zip version of non-v1 history project'
        )
        return res.sendStatus(402)
      }
      HistoryController._pipeHistoryZipToResponse(
        v1Id,
        version,
        `${project.name} (Version ${version})`,
        req,
        res,
        next
      )
    })
  },

  _pipeHistoryZipToResponse(v1ProjectId, version, name, req, res, next) {
    if (req.destroyed) {
      // client has disconnected -- skip project history api call and download
      return
    }
    // increase timeout to 6 minutes
    res.setTimeout(6 * 60 * 1000)
    const url = `${settings.apis.v1_history.url}/projects/${v1ProjectId}/version/${version}/zip`
    const options = {
      auth: {
        user: settings.apis.v1_history.user,
        pass: settings.apis.v1_history.pass,
      },
      json: true,
      url,
    }

    if (!Features.hasFeature('saas')) {
      const getReq = request({ ...options, method: 'get' })

      pipeline(getReq, res, function (err) {
        if (err) {
          logger.error({ url, err }, 'history API error')
          next(err)
        }
      })
      return
    }

    request({ ...options, method: 'post' }, function (err, response, body) {
      if (err) {
        OError.tag(err, 'history API error', {
          v1ProjectId,
          version,
        })
        return next(err)
      }
      if (response.statusCode !== 200) {
        if (response.statusCode === 404) {
          return next(new Errors.NotFoundError('zip not found'))
        } else {
          return next(
            new OError('Error while getting zip for download', {
              v1ProjectId,
              statusCode: response.statusCode,
            })
          )
        }
      }
      if (req.destroyed) {
        // client has disconnected -- skip delayed s3 download
        return
      }
      if (!body.zipUrl) {
        return next(
          new OError('Missing zipUrl, cannot fetch zip file', {
            v1ProjectId,
            body,
            statusCode: response.statusCode,
          })
        )
      }
      let retryAttempt = 0
      let retryDelay = 2000
      // retry for about 6 minutes starting with short delay
      async.retry(
        40,
        callback =>
          setTimeout(function () {
            if (req.destroyed) {
              // client has disconnected -- skip s3 download
              return callback() // stop async.retry loop
            }

            // increase delay by 1 second up to 10
            if (retryDelay < 10000) {
              retryDelay += 1000
            }
            retryAttempt++
            const getReq = request({
              url: body.zipUrl,
              sendImmediately: true,
            })
            const abortS3Request = () => getReq.abort()
            req.on('close', abortS3Request)
            res.on('timeout', abortS3Request)
            function cleanupAbortTrigger() {
              req.off('close', abortS3Request)
              res.off('timeout', abortS3Request)
            }
            getReq.on('response', function (response) {
              if (response.statusCode !== 200) {
                cleanupAbortTrigger()
                return callback(new Error('invalid response'))
              }
              // pipe also proxies the headers, but we want to customize these ones
              delete response.headers['content-disposition']
              delete response.headers['content-type']
              res.status(response.statusCode)
              prepareZipAttachment(res, `${name}.zip`)
              pipeline(response, res, err => {
                if (err) {
                  logger.warn(
                    { err, v1ProjectId, version, retryAttempt },
                    'history s3 proxying error'
                  )
                }
              })
              callback()
            })
            getReq.on('error', function (err) {
              logger.warn(
                { err, v1ProjectId, version, retryAttempt },
                'history s3 download error'
              )
              cleanupAbortTrigger()
              callback(err)
            })
          }, retryDelay),
        function (err) {
          if (err) {
            OError.tag(err, 'history s3 download failed', {
              v1ProjectId,
              version,
              retryAttempt,
            })
            next(err)
          }
        }
      )
    })
  },
}
