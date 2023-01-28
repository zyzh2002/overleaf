import { expect } from 'chai'
import request from 'request'
import Settings from '@overleaf/settings'
import RedisWrapper from '@overleaf/redis-wrapper'
import { db } from '../../../../app/js/mongodb.js'

const rclient = RedisWrapper.createClient(Settings.redis.project_history)
const Keys = Settings.redis.project_history.key_schema

export function resetDatabase(callback) {
  rclient.flushdb(callback)
}

export function initializeProject(historyId, callback) {
  request.post(
    {
      url: 'http://localhost:3054/project',
      json: { historyId },
    },
    (error, res, body) => {
      if (error) {
        return callback(error)
      }
      expect(res.statusCode).to.equal(200)
      callback(null, body.project)
    }
  )
}

export function flushProject(projectId, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = null
  }
  if (!options) {
    options = { allowErrors: false }
  }
  request.post(
    {
      url: `http://localhost:3054/project/${projectId}/flush`,
    },
    (error, res, body) => {
      if (error) {
        return callback(error)
      }
      if (!options.allowErrors) {
        expect(res.statusCode).to.equal(204)
      }
      callback(error, res)
    }
  )
}

export function getSummarizedUpdates(projectId, query, callback) {
  request.get(
    {
      url: `http://localhost:3054/project/${projectId}/updates`,
      qs: query,
      json: true,
    },
    (error, res, body) => {
      if (error) {
        return callback(error)
      }
      expect(res.statusCode).to.equal(200)
      callback(error, body)
    }
  )
}

export function getDiff(projectId, pathname, from, to, callback) {
  request.get(
    {
      url: `http://localhost:3054/project/${projectId}/diff`,
      qs: {
        pathname,
        from,
        to,
      },
      json: true,
    },
    (error, res, body) => {
      if (error) {
        return callback(error)
      }
      expect(res.statusCode).to.equal(200)
      callback(error, body)
    }
  )
}

export function getFileTreeDiff(projectId, from, to, callback) {
  request.get(
    {
      url: `http://localhost:3054/project/${projectId}/filetree/diff`,
      qs: {
        from,
        to,
      },
      json: true,
    },
    (error, res, body) => {
      if (error) {
        return callback(error)
      }
      callback(error, body, res.statusCode)
    }
  )
}

export function getSnapshot(projectId, pathname, version, options, callback) {
  if (typeof options === 'function') {
    callback = options
    options = null
  }
  if (!options) {
    options = { allowErrors: false }
  }
  request.get(
    {
      url: `http://localhost:3054/project/${projectId}/version/${version}/${encodeURIComponent(
        pathname
      )}`,
    },
    (error, res, body) => {
      if (error) {
        return callback(error)
      }
      if (!options.allowErrors) {
        expect(res.statusCode).to.equal(200)
      }
      callback(error, body, res.statusCode)
    }
  )
}

export function pushRawUpdate(projectId, update, callback) {
  rclient.rpush(
    Keys.projectHistoryOps({ project_id: projectId }),
    JSON.stringify(update),
    callback
  )
}

export function setFirstOpTimestamp(projectId, timestamp, callback) {
  rclient.set(
    Keys.projectHistoryFirstOpTimestamp({ project_id: projectId }),
    timestamp,
    callback
  )
}

export function getFirstOpTimestamp(projectId, callback) {
  rclient.get(
    Keys.projectHistoryFirstOpTimestamp({ project_id: projectId }),
    callback
  )
}

export function clearFirstOpTimestamp(projectId, callback) {
  rclient.del(
    Keys.projectHistoryFirstOpTimestamp({ project_id: projectId }),
    callback
  )
}

export function getQueueLength(projectId, callback) {
  rclient.llen(Keys.projectHistoryOps({ project_id: projectId }), callback)
}

export function getQueueCounts(callback) {
  return request.get(
    {
      url: 'http://localhost:3054/status/queue',
      json: true,
    },
    callback
  )
}

export function resyncHistory(projectId, callback) {
  request.post(
    {
      url: `http://localhost:3054/project/${projectId}/resync`,
      json: true,
      body: { origin: { kind: 'test-origin' } },
    },
    (error, res, body) => {
      if (error) {
        return callback(error)
      }
      expect(res.statusCode).to.equal(204)
      callback(error)
    }
  )
}

export function createLabel(
  projectId,
  userId,
  version,
  comment,
  createdAt,
  callback
) {
  request.post(
    {
      url: `http://localhost:3054/project/${projectId}/user/${userId}/labels`,
      json: { comment, version, created_at: createdAt },
    },
    (error, res, body) => {
      if (error) {
        return callback(error)
      }
      expect(res.statusCode).to.equal(200)
      callback(null, body)
    }
  )
}

export function getLabels(projectId, callback) {
  request.get(
    {
      url: `http://localhost:3054/project/${projectId}/labels`,
      json: true,
    },
    (error, res, body) => {
      if (error) {
        return callback(error)
      }
      expect(res.statusCode).to.equal(200)
      callback(null, body)
    }
  )
}

export function deleteLabel(projectId, userId, labelId, callback) {
  request.delete(
    {
      url: `http://localhost:3054/project/${projectId}/user/${userId}/labels/${labelId}`,
    },
    (error, res, body) => {
      if (error) {
        return callback(error)
      }
      expect(res.statusCode).to.equal(204)
      callback(null, body)
    }
  )
}

export function setFailure(failureEntry, callback) {
  db.projectHistoryFailures.remove(
    { project_id: { $exists: true } },
    (err, result) => {
      if (err) {
        return callback(err)
      }
      db.projectHistoryFailures.insert(failureEntry, callback)
    }
  )
}

export function transferLabelOwnership(fromUser, toUser, callback) {
  request.post(
    {
      url: `http://localhost:3054/user/${fromUser}/labels/transfer/${toUser}`,
    },
    (error, res, body) => {
      if (error) {
        return callback(error)
      }
      expect(res.statusCode).to.equal(204)
      callback(null, body)
    }
  )
}

export function getDump(projectId, callback) {
  request.get(
    `http://localhost:3054/project/${projectId}/dump`,
    (err, res, body) => {
      if (err) {
        return callback(err)
      }
      expect(res.statusCode).to.equal(200)
      callback(null, JSON.parse(body))
    }
  )
}

export function deleteProject(projectId, callback) {
  request.delete(`http://localhost:3054/project/${projectId}`, (err, res) => {
    if (err) {
      return callback(err)
    }
    expect(res.statusCode).to.equal(204)
    callback()
  })
}
