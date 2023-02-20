const { ReadPreference, ObjectId } = require('mongodb')
const { db, waitForDb } = require('../../app/src/infrastructure/mongodb')

let BATCH_DESCENDING
let BATCH_SIZE
let VERBOSE_LOGGING
let BATCH_LAST_ID
let BATCH_RANGE_END
refreshGlobalOptionsForBatchedUpdate()

function refreshGlobalOptionsForBatchedUpdate(options = {}) {
  options = Object.assign({}, options, process.env)

  BATCH_DESCENDING = options.BATCH_DESCENDING === 'true'
  BATCH_SIZE = parseInt(options.BATCH_SIZE, 10) || 1000
  VERBOSE_LOGGING = options.VERBOSE_LOGGING === 'true'
  if (options.BATCH_LAST_ID) {
    BATCH_LAST_ID = ObjectId(options.BATCH_LAST_ID)
  } else if (options.BATCH_RANGE_START) {
    BATCH_LAST_ID = ObjectId(options.BATCH_RANGE_START)
  }
  if (options.BATCH_RANGE_END) {
    BATCH_RANGE_END = ObjectId(options.BATCH_RANGE_END)
  }
}

async function getNextBatch(collection, query, maxId, projection, options) {
  const queryIdField = {}
  maxId = maxId || BATCH_LAST_ID
  if (maxId) {
    if (BATCH_DESCENDING) {
      queryIdField.$lt = maxId
    } else {
      queryIdField.$gt = maxId
    }
  }
  if (BATCH_RANGE_END) {
    if (BATCH_DESCENDING) {
      queryIdField.$gt = BATCH_RANGE_END
    } else {
      queryIdField.$lt = BATCH_RANGE_END
    }
  }
  if (queryIdField.$gt || queryIdField.$lt) {
    query._id = queryIdField
  }
  const entries = await collection
    .find(query, options)
    .project(projection)
    .sort({ _id: BATCH_DESCENDING ? -1 : 1 })
    .limit(BATCH_SIZE)
    .toArray()
  return entries
}

async function performUpdate(collection, nextBatch, update) {
  return collection.updateMany(
    { _id: { $in: nextBatch.map(entry => entry._id) } },
    update
  )
}

async function batchedUpdate(
  collectionName,
  query,
  update,
  projection,
  findOptions,
  batchedUpdateOptions
) {
  refreshGlobalOptionsForBatchedUpdate(batchedUpdateOptions)
  await waitForDb()
  const collection = db[collectionName]

  findOptions = findOptions || {}
  findOptions.readPreference = ReadPreference.SECONDARY

  projection = projection || { _id: 1 }
  let nextBatch
  let updated = 0
  let maxId
  while (
    (nextBatch = await getNextBatch(
      collection,
      query,
      maxId,
      projection,
      findOptions
    )).length
  ) {
    maxId = nextBatch[nextBatch.length - 1]._id
    updated += nextBatch.length
    if (VERBOSE_LOGGING) {
      console.log(
        `Running update on batch with ids ${JSON.stringify(
          nextBatch.map(entry => entry._id)
        )}`
      )
    } else {
      console.error(`Running update on batch ending ${maxId}`)
    }

    if (typeof update === 'function') {
      await update(collection, nextBatch)
    } else {
      await performUpdate(collection, nextBatch, update)
    }

    console.error(`Completed batch ending ${maxId}`)
  }
  return updated
}

function batchedUpdateWithResultHandling(
  collection,
  query,
  update,
  projection,
  options
) {
  batchedUpdate(collection, query, update, projection, options)
    .then(updated => {
      console.error({ updated })
      process.exit(0)
    })
    .catch(error => {
      console.error({ error })
      process.exit(1)
    })
}

module.exports = {
  getNextBatch,
  batchedUpdate,
  batchedUpdateWithResultHandling,
}
