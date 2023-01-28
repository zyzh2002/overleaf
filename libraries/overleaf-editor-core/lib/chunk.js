'use strict'

const assert = require('check-types').assert
const OError = require('@overleaf/o-error')

const History = require('./history')

/**
 * @typedef {import("./types").BlobStore} BlobStore
 * @typedef {import("./change")} Change
 * @typedef {import("./snapshot")} Snapshot
 */

/**
 * @constructor
 * @param {History} history
 * @param {number} startVersion
 *
 * @classdesc
 * A Chunk is a {@link History} that is part of a project's overall history. It
 * has a start and an end version that place its History in context.
 */
function Chunk(history, startVersion) {
  assert.instance(history, History, 'bad history')
  assert.integer(startVersion, 'bad startVersion')

  this.history = history
  this.startVersion = startVersion
}

class ConflictingEndVersion extends OError {
  constructor(clientEndVersion, latestEndVersion) {
    const message =
      'client sent updates with end_version ' +
      clientEndVersion +
      ' but latest chunk has end_version ' +
      latestEndVersion
    super(message, { clientEndVersion, latestEndVersion })
    this.clientEndVersion = clientEndVersion
    this.latestEndVersion = latestEndVersion
  }
}
Chunk.ConflictingEndVersion = ConflictingEndVersion

class NotFoundError extends OError {
  // `message` and `info` optional arguments allow children classes to override
  // these values, ensuring backwards compatibility with previous implementation
  // based on the `overleaf-error-type` library
  constructor(projectId, message, info) {
    const errorMessage = message || `no chunks for project ${projectId}`
    const errorInfo = info || { projectId }
    super(errorMessage, errorInfo)
    this.projectId = projectId
  }
}
Chunk.NotFoundError = NotFoundError

class VersionNotFoundError extends NotFoundError {
  constructor(projectId, version) {
    super(projectId, `chunk for ${projectId} v ${version} not found`, {
      projectId,
      version,
    })
    this.projectId = projectId
    this.version = version
  }
}
Chunk.VersionNotFoundError = VersionNotFoundError

class BeforeTimestampNotFoundError extends NotFoundError {
  constructor(projectId, timestamp) {
    super(projectId, `chunk for ${projectId} timestamp ${timestamp} not found`)
    this.projectId = projectId
    this.timestamp = timestamp
  }
}
Chunk.BeforeTimestampNotFoundError = BeforeTimestampNotFoundError

class NotPersistedError extends NotFoundError {
  constructor(projectId) {
    super(projectId, `chunk for ${projectId} not persisted yet`)
    this.projectId = projectId
  }
}
Chunk.NotPersistedError = NotPersistedError

Chunk.fromRaw = function chunkFromRaw(raw) {
  return new Chunk(History.fromRaw(raw.history), raw.startVersion)
}

Chunk.prototype.toRaw = function chunkToRaw() {
  return { history: this.history.toRaw(), startVersion: this.startVersion }
}

/**
 * The history for this chunk.
 *
 * @return {History}
 */
Chunk.prototype.getHistory = function () {
  return this.history
}

/**
 * {@see History#getSnapshot}
 * @return {Snapshot}
 */
Chunk.prototype.getSnapshot = function () {
  return this.history.getSnapshot()
}

/**
 * {@see History#getChanges}
 * @return {Array.<Change>}
 */
Chunk.prototype.getChanges = function () {
  return this.history.getChanges()
}

/**
 * {@see History#pushChanges}
 * @param {Array.<Change>} changes
 */
Chunk.prototype.pushChanges = function chunkPushChanges(changes) {
  this.history.pushChanges(changes)
}

/**
 * The version of the project after applying all changes in this chunk.
 *
 * @return {number} non-negative, greater than or equal to start version
 */
Chunk.prototype.getEndVersion = function chunkGetEndVersion() {
  return this.startVersion + this.history.countChanges()
}

/**
 * The timestamp of the last change in this chunk
 */

Chunk.prototype.getEndTimestamp = function getEndTimestamp() {
  if (!this.history.countChanges()) return null
  return this.history.getChanges().slice(-1)[0].getTimestamp()
}

/**
 * The version of the project before applying all changes in this chunk.
 *
 * @return {number} non-negative, less than or equal to end version
 */
Chunk.prototype.getStartVersion = function () {
  return this.startVersion
}

/**
 * {@see History#loadFiles}
 *
 * @param {string} kind
 * @param {BlobStore} blobStore
 * @return {Promise}
 */
Chunk.prototype.loadFiles = function chunkLoadFiles(kind, blobStore) {
  return this.history.loadFiles(kind, blobStore)
}

module.exports = Chunk
