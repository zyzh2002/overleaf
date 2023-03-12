/* eslint-disable
    camelcase,
    n/handle-callback-err,
    max-len,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let ProjectCollabratecDetailsHandler
const { ObjectId } = require('mongodb')
const { Project } = require('../../models/Project')

module.exports = ProjectCollabratecDetailsHandler = {
  initializeCollabratecProject(
    project_id,
    user_id,
    collabratec_document_id,
    collabratec_privategroup_id,
    callback
  ) {
    if (callback == null) {
      callback = function () {}
    }
    ProjectCollabratecDetailsHandler.setCollabratecUsers(
      project_id,
      [{ user_id, collabratec_document_id, collabratec_privategroup_id }],
      callback
    )
  },

  isLinkedCollabratecUserProject(project_id, user_id, callback) {
    if (callback == null) {
      callback = function () {}
    }
    try {
      project_id = ObjectId(project_id)
      user_id = ObjectId(user_id)
    } catch (error) {
      const err = error
      return callback(err)
    }
    const query = {
      _id: project_id,
      collabratecUsers: {
        $elemMatch: {
          user_id,
        },
      },
    }
    Project.findOne(query, { _id: 1 }, function (err, project) {
      if (err != null) {
        callback(err)
      }
      callback(null, project != null)
    })
  },

  linkCollabratecUserProject(
    project_id,
    user_id,
    collabratec_document_id,
    callback
  ) {
    if (callback == null) {
      callback = function () {}
    }
    try {
      project_id = ObjectId(project_id)
      user_id = ObjectId(user_id)
    } catch (error) {
      const err = error
      return callback(err)
    }
    const query = {
      _id: project_id,
      collabratecUsers: {
        $not: {
          $elemMatch: {
            collabratec_document_id,
            user_id,
          },
        },
      },
    }
    const update = {
      $push: {
        collabratecUsers: {
          collabratec_document_id,
          user_id,
        },
      },
    }
    Project.updateOne(query, update, callback)
  },

  setCollabratecUsers(project_id, collabratec_users, callback) {
    let err
    if (callback == null) {
      callback = function () {}
    }
    try {
      project_id = ObjectId(project_id)
    } catch (error) {
      err = error
      return callback(err)
    }
    if (!Array.isArray(collabratec_users)) {
      callback(new Error('collabratec_users must be array'))
    }
    for (const collabratec_user of Array.from(collabratec_users)) {
      try {
        collabratec_user.user_id = ObjectId(collabratec_user.user_id)
      } catch (error1) {
        err = error1
        return callback(err)
      }
    }
    const update = { $set: { collabratecUsers: collabratec_users } }
    Project.updateOne({ _id: project_id }, update, callback)
  },

  unlinkCollabratecUserProject(project_id, user_id, callback) {
    if (callback == null) {
      callback = function () {}
    }
    try {
      project_id = ObjectId(project_id)
      user_id = ObjectId(user_id)
    } catch (error) {
      const err = error
      return callback(err)
    }
    const query = { _id: project_id }
    const update = {
      $pull: {
        collabratecUsers: {
          user_id,
        },
      },
    }
    Project.updateOne(query, update, callback)
  },

  updateCollabratecUserIds(old_user_id, new_user_id, callback) {
    if (callback == null) {
      callback = function () {}
    }
    try {
      old_user_id = ObjectId(old_user_id)
      new_user_id = ObjectId(new_user_id)
    } catch (error) {
      const err = error
      return callback(err)
    }
    const query = { 'collabratecUsers.user_id': old_user_id }
    const update = { $set: { 'collabratecUsers.$.user_id': new_user_id } }
    Project.updateMany(query, update, callback)
  },
}
