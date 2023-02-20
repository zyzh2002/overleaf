import Metrics from '@overleaf/metrics'
import Settings from '@overleaf/settings'
import { MongoClient } from 'mongodb'

export { ObjectId } from 'mongodb'

export const mongoClient = new MongoClient(Settings.mongo.url)
const mongoDb = mongoClient.db()

export const db = {
  messages: mongoDb.collection('messages'),
  rooms: mongoDb.collection('rooms'),
}

Metrics.mongodb.monitor(mongoClient)
