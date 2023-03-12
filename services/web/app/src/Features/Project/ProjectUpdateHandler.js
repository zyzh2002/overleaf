/* eslint-disable
    camelcase,
    n/handle-callback-err,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const { Project } = require('../../models/Project')
const logger = require('@overleaf/logger')
const { promisifyAll } = require('../../util/promises')

const ProjectUpdateHandler = {
  markAsUpdated(projectId, lastUpdatedAt, lastUpdatedBy, callback) {
    if (callback == null) {
      callback = function () {}
    }
    if (lastUpdatedAt == null) {
      lastUpdatedAt = new Date()
    }

    const conditions = {
      _id: projectId,
      lastUpdated: { $lt: lastUpdatedAt },
    }

    const update = {
      lastUpdated: lastUpdatedAt || new Date().getTime(),
      lastUpdatedBy,
    }
    Project.updateOne(conditions, update, {}, callback)
  },

  // like markAsUpdated but allows lastUpdatedAt to be reset to earlier time
  resetUpdated(projectId, lastUpdatedAt, lastUpdatedBy, callback) {
    if (callback == null) {
      callback = function () {}
    }
    if (lastUpdatedAt == null) {
      lastUpdatedAt = new Date()
    }

    const conditions = {
      _id: projectId,
    }

    const update = {
      lastUpdated: lastUpdatedAt || new Date().getTime(),
      lastUpdatedBy,
    }
    Project.updateOne(conditions, update, {}, callback)
  },

  markAsOpened(project_id, callback) {
    const conditions = { _id: project_id }
    const update = { lastOpened: Date.now() }
    Project.updateOne(conditions, update, {}, function (err) {
      if (callback != null) {
        return callback()
      }
    })
  },

  markAsInactive(project_id, callback) {
    const conditions = { _id: project_id }
    const update = { active: false }
    Project.updateOne(conditions, update, {}, function (err) {
      if (callback != null) {
        return callback()
      }
    })
  },

  markAsActive(project_id, callback) {
    const conditions = { _id: project_id }
    const update = { active: true }
    Project.updateOne(conditions, update, {}, function (err) {
      if (callback != null) {
        return callback()
      }
    })
  },
}

ProjectUpdateHandler.promises = promisifyAll(ProjectUpdateHandler)
module.exports = ProjectUpdateHandler
