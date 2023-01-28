/**
 * Mongo backend for the blob store.
 *
 * Blobs are stored in the projectHistoryBlobs collection. Each project has a
 * document in that collection. That document has a "blobs" subdocument whose
 * fields are buckets of blobs. The key of a bucket is the first three hex
 * digits of the blob hash. The value of the bucket is an array of blobs that
 * match the key.
 *
 * Buckets have a maximum capacity of 8 blobs. When that capacity is exceeded,
 * blobs are stored in a secondary collection: the projectHistoryShardedBlobs
 * collection. This collection shards blobs between 16 documents per project.
 * The shard key is the first hex digit of the hash. The documents are also
 * organized in buckets, but the bucket key is made of hex digits 2, 3 and 4.
 */

const { Blob } = require('overleaf-editor-core')
const { ObjectId, Binary } = require('mongodb')
const assert = require('../assert')
const mongodb = require('../mongodb')

const MAX_BLOBS_IN_BUCKET = 8
const DUPLICATE_KEY_ERROR_CODE = 11000

/**
 * Set up the data structures for a given project.
 */
async function initialize(projectId) {
  assert.mongoId(projectId, 'bad projectId')
  try {
    await mongodb.blobs.insertOne({
      _id: ObjectId(projectId),
      blobs: {},
    })
  } catch (err) {
    if (err.code !== DUPLICATE_KEY_ERROR_CODE) {
      throw err
    }
  }
}

/**
 * Return blob metadata for the given project and hash.
 */
async function findBlob(projectId, hash) {
  assert.mongoId(projectId, 'bad projectId')
  assert.blobHash(hash, 'bad hash')

  const bucket = getBucket(hash)
  const result = await mongodb.blobs.findOne(
    { _id: ObjectId(projectId) },
    { projection: { _id: 0, bucket: `$${bucket}` } }
  )

  if (result?.bucket == null) {
    return null
  }

  const record = result.bucket.find(blob => blob.h.toString('hex') === hash)
  if (record == null) {
    if (result.bucket.length >= MAX_BLOBS_IN_BUCKET) {
      return await findBlobSharded(projectId, hash)
    } else {
      return null
    }
  }
  return recordToBlob(record)
}

/**
 * Search in the sharded collection for blob metadata
 */
async function findBlobSharded(projectId, hash) {
  const [shard, bucket] = getShardedBucket(hash)
  const id = makeShardedId(projectId, shard)
  const result = await mongodb.shardedBlobs.findOne(
    { _id: id },
    { projection: { _id: 0, blobs: `$${bucket}` } }
  )
  if (result?.blobs == null) {
    return null
  }
  const record = result.blobs.find(blob => blob.h.toString('hex') === hash)
  return recordToBlob(record)
}

/**
 * Read multiple blob metadata records by hexadecimal hashes.
 */
async function findBlobs(projectId, hashes) {
  assert.mongoId(projectId, 'bad projectId')
  assert.array(hashes, 'bad hashes: not array')
  hashes.forEach(function (hash) {
    assert.blobHash(hash, 'bad hash')
  })

  // Build a set of unique buckets
  const buckets = new Set(hashes.map(getBucket))

  // Get buckets from Mongo
  const projection = { _id: 0 }
  for (const bucket of buckets) {
    projection[bucket] = 1
  }
  const result = await mongodb.blobs.findOne(
    { _id: ObjectId(projectId) },
    { projection }
  )

  if (result?.blobs == null) {
    return []
  }

  // Build blobs from the query results
  const hashSet = new Set(hashes)
  const blobs = []
  for (const bucket of Object.values(result.blobs)) {
    for (const record of bucket) {
      const hash = record.h.toString('hex')
      if (hashSet.has(hash)) {
        blobs.push(recordToBlob(record))
        hashSet.delete(hash)
      }
    }
  }

  // If we haven't found all the blobs, look in the sharded collection
  if (hashSet.size > 0) {
    const shardedBlobs = await findBlobsSharded(projectId, hashSet)
    blobs.push(...shardedBlobs)
  }

  return blobs
}

/**
 * Search in the sharded collection for blob metadata.
 */
async function findBlobsSharded(projectId, hashSet) {
  // Build a map of buckets by shard key
  const bucketsByShard = new Map()
  for (const hash of hashSet) {
    const [shard, bucket] = getShardedBucket(hash)
    let buckets = bucketsByShard.get(shard)
    if (buckets == null) {
      buckets = new Set()
      bucketsByShard.set(shard, buckets)
    }
    buckets.add(bucket)
  }

  // Make parallel requests to the shards that might contain the hashes we want
  const requests = []
  for (const [shard, buckets] of bucketsByShard.entries()) {
    const id = makeShardedId(projectId, shard)
    const projection = { _id: 0 }
    for (const bucket of buckets) {
      projection[bucket] = 1
    }
    const request = mongodb.shardedBlobs.findOne({ _id: id }, { projection })
    requests.push(request)
  }
  const results = await Promise.all(requests)

  // Build blobs from the query results
  const blobs = []
  for (const result of results) {
    if (result?.blobs == null) {
      continue
    }

    for (const bucket of Object.values(result.blobs)) {
      for (const record of bucket) {
        const hash = record.h.toString('hex')
        if (hashSet.has(hash)) {
          blobs.push(recordToBlob(record))
        }
      }
    }
  }
  return blobs
}

/**
 * Add a blob's metadata to the blobs collection after it has been uploaded.
 */
async function insertBlob(projectId, blob) {
  assert.mongoId(projectId, 'bad projectId')
  const hash = blob.getHash()
  const bucket = getBucket(hash)
  const record = blobToRecord(blob)
  const result = await mongodb.blobs.updateOne(
    {
      _id: ObjectId(projectId),
      $expr: {
        $lt: [{ $size: { $ifNull: [`$${bucket}`, []] } }, MAX_BLOBS_IN_BUCKET],
      },
    },
    {
      $addToSet: { [bucket]: record },
    }
  )

  if (result.matchedCount === 0) {
    await insertRecordSharded(projectId, hash, record)
  }
}

/**
 * Add a blob's metadata to the sharded blobs collection.
 */
async function insertRecordSharded(projectId, hash, record) {
  const [shard, bucket] = getShardedBucket(hash)
  const id = makeShardedId(projectId, shard)
  await mongodb.shardedBlobs.updateOne(
    { _id: id },
    { $addToSet: { [bucket]: record } },
    { upsert: true }
  )
}

/**
 * Delete all blobs for a given project.
 */
async function deleteBlobs(projectId) {
  assert.mongoId(projectId, 'bad projectId')
  await mongodb.blobs.deleteOne({ _id: ObjectId(projectId) })
  const minShardedId = makeShardedId(projectId, '0')
  const maxShardedId = makeShardedId(projectId, 'f')
  await mongodb.shardedBlobs.deleteMany({
    _id: { $gte: minShardedId, $lte: maxShardedId },
  })
}

/**
 * Return the Mongo path to the bucket for the given hash.
 */
function getBucket(hash) {
  return `blobs.${hash.slice(0, 3)}`
}

/**
 * Return the shard key and Mongo path to the bucket for the given hash in the
 * sharded collection.
 */
function getShardedBucket(hash) {
  const shard = hash.slice(0, 1)
  const bucket = `blobs.${hash.slice(1, 4)}`
  return [shard, bucket]
}

/**
 * Create an _id key for the sharded collection.
 */
function makeShardedId(projectId, shard) {
  return new Binary(Buffer.from(`${projectId}0${shard}`, 'hex'))
}

/**
 * Return the Mongo record for the given blob.
 */
function blobToRecord(blob) {
  const hash = blob.getHash()
  const byteLength = blob.getByteLength()
  const stringLength = blob.getStringLength()
  return {
    h: new Binary(Buffer.from(hash, 'hex')),
    b: byteLength,
    s: stringLength,
  }
}

/**
 * Create a blob from the given Mongo record.
 */
function recordToBlob(record) {
  if (record == null) {
    return
  }
  return new Blob(record.h.toString('hex'), record.b, record.s)
}

module.exports = {
  initialize,
  findBlob,
  findBlobs,
  insertBlob,
  deleteBlobs,
}
