#!/usr/bin/env node

// To run in dev:
//
// docker-compose run --rm project-history scripts/clear_deleted.js
//
// In production:
//
// docker run --rm $(docker ps -lq) scripts/clear_deleted.js

import async from 'async'
import logger from '@overleaf/logger'
import request from 'request'
import Settings from '@overleaf/settings'
import redis from '@overleaf/redis-wrapper'
import { db, ObjectId } from '../app/js/mongodb.js'

logger.logger.level('fatal')

const rclient = redis.createClient(Settings.redis.project_history)
const Keys = Settings.redis.project_history.key_schema

const argv = process.argv.slice(2)
const limit = parseInt(argv[0], 10) || null
const force = argv[1] === 'force' || false
let projectNotFoundErrors = 0
let projectImportedFromV1Errors = 0
const projectsNotFound = []
const projectsImportedFromV1 = []

function checkAndClear(project, callback) {
  const projectId = project.project_id
  console.log('checking project', projectId)

  // These can probably also be reset and their overleaf.history.id unset
  // (unless they are v1 projects).

  function checkNotV1Project(cb) {
    db.projects.findOne(
      { _id: ObjectId(projectId) },
      { projection: { overleaf: true } },
      (err, result) => {
        console.log(
          '1. looking in mongo projects collection: err',
          err,
          'result',
          JSON.stringify(result)
        )
        if (err) {
          return cb(err)
        }
        if (!result) {
          return cb(new Error('project not found in mongo'))
        }
        if (result && result.overleaf && !result.overleaf.id) {
          console.log(' - project is not imported from v1 - ok to clear')
          cb()
        } else {
          cb(new Error('project is imported from v1 - will not clear it'))
        }
      }
    )
  }

  function clearProjectHistoryInMongo(cb) {
    if (force) {
      console.log('2. deleting overleaf.history.id in mongo project', projectId)
      // Accessing mongo projects collection directly - BE CAREFUL!
      db.projects.updateOne(
        { _id: ObjectId(projectId) },
        { $unset: { 'overleaf.history.id': '' } },
        (err, result) => {
          console.log(' - got result from remove', err, result)
          if (err) {
            return err
          }
          if (
            result &&
            (result.modifiedCount === 1 || result.modifiedCount === 0)
          ) {
            return cb()
          } else {
            return cb(
              new Error('error: problem trying to unset overleaf.history.id')
            )
          }
        }
      )
    } else {
      console.log(
        '2. would delete overleaf.history.id for',
        projectId,
        'from mongo'
      )
      cb()
    }
  }

  function clearDocUpdaterCache(cb) {
    const url = Settings.apis.documentupdater.url + '/project/' + projectId
    if (force) {
      console.log('3. making request to clear docupdater', url)
      request.delete(url, (err, response, body) => {
        console.log(
          ' - result of request',
          err,
          response && response.statusCode,
          body
        )
        cb(err)
      })
    } else {
      console.log('3. dry run, would request DELETE on url', url)
      cb()
    }
  }

  function clearRedisQueue(cb) {
    const key = Keys.projectHistoryOps({ project_id: projectId })
    if (force) {
      console.log('4. deleting redis queue key', key)
      rclient.del(key, err => {
        cb(err)
      })
    } else {
      console.log('4. dry run, would delete redis key', key)
      cb()
    }
  }

  function clearMongoEntry(cb) {
    if (force) {
      console.log('5. deleting key in mongo projectHistoryFailures', projectId)
      db.projectHistoryFailures.deleteOne(
        { project_id: projectId },
        (err, result) => {
          console.log(' - got result from remove', err, result)
          cb(err)
        }
      )
    } else {
      console.log('5. would delete failure record for', projectId, 'from mongo')
      cb()
    }
  }

  // do the checks and deletions
  async.waterfall(
    [
      checkNotV1Project,
      clearProjectHistoryInMongo,
      clearDocUpdaterCache,
      clearRedisQueue,
      clearMongoEntry,
    ],
    err => {
      if (!err) {
        return setTimeout(callback, 1000) // include a 1 second delay
      } else if (err.message === 'project not found in mongo') {
        projectNotFoundErrors++
        projectsNotFound.push(projectId)
        return callback()
      } else if (
        err.message === 'project is imported from v1 - will not clear it'
      ) {
        projectImportedFromV1Errors++
        projectsImportedFromV1.push(projectId)
        return callback()
      } else {
        console.log('error:', err)
        return callback(err)
      }
    }
  )
}

// find all the broken projects from the failure records
async function main() {
  const results = await db.projectHistoryFailures
    .find({ error: 'Error: bad response from filestore: 404' })
    .toArray()

  console.log('number of queues without filestore 404 =', results.length)
  // now check if the project is truly deleted in mongo
  async.eachSeries(results.slice(0, limit), checkAndClear, err => {
    console.log('Final error status', err)
    console.log(
      'Project not found errors',
      projectNotFoundErrors,
      projectsNotFound
    )
    console.log(
      'Project imported from V1 errors',
      projectImportedFromV1Errors,
      projectsImportedFromV1
    )
    process.exit()
  })
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
