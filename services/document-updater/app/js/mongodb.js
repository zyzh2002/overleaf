const Metrics = require('@overleaf/metrics')
const Settings = require('@overleaf/settings')
const { MongoClient, ObjectId } = require('mongodb')

const mongoClient = new MongoClient(Settings.mongo.url)
const mongoDb = mongoClient.db()

const db = {
  docs: mongoDb.collection('docs'),
  docSnapshots: mongoDb.collection('docSnapshots'),
  projects: mongoDb.collection('projects'),
}

async function healthCheck() {
  const res = await mongoDb.command({ ping: 1 })
  if (!res.ok) {
    throw new Error('failed mongo ping')
  }
}

Metrics.mongodb.monitor(mongoClient)

module.exports = {
  db,
  ObjectId,
  mongoClient,
  healthCheck: require('util').callbackify(healthCheck),
}
