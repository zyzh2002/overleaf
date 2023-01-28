'use strict'

const Archive = require('archiver')
const BPromise = require('bluebird')
const fs = require('fs')

const core = require('overleaf-editor-core')
const Snapshot = core.Snapshot
const OError = require('@overleaf/o-error')

const assert = require('./assert')

// The maximum safe concurrency appears to be 1.
// https://github.com/overleaf/issues/issues/1909
const FETCH_CONCURRENCY = 1 // number of files to fetch at once
const DEFAULT_ZIP_TIMEOUT = 25000 // ms

class DownloadError extends OError {
  constructor(hash) {
    super(`ProjectArchive: blob download failed: ${hash}`, { hash })
  }
}
ProjectArchive.DownloadError = DownloadError

class ArchiveTimeout extends OError {
  constructor() {
    super('ProjectArchive timed out')
  }
}
ProjectArchive.ArchiveTimeout = ArchiveTimeout

/**
 * @constructor
 * @param {Snapshot} snapshot
 * @param {?number} timeout in ms
 * @classdesc
 * Writes the project snapshot to a zip file.
 */
function ProjectArchive(snapshot, timeout) {
  assert.instance(snapshot, Snapshot)
  this.snapshot = snapshot
  this.timeout = timeout || DEFAULT_ZIP_TIMEOUT
}

/**
 * Write zip archive to the given file path.
 *
 * @param {BlobStore} blobStore
 * @param {string} zipFilePath
 */
ProjectArchive.prototype.writeZip = function projectArchiveToZip(
  blobStore,
  zipFilePath
) {
  const snapshot = this.snapshot
  const timeout = this.timeout

  const startTime = process.hrtime()
  const archive = new Archive('zip')

  // Convert elapsed seconds and nanoseconds to milliseconds.
  function findElapsedMilliseconds() {
    const elapsed = process.hrtime(startTime)
    return elapsed[0] * 1e3 + elapsed[1] * 1e-6
  }

  function addFileToArchive(pathname) {
    if (findElapsedMilliseconds() > timeout) {
      throw new ProjectArchive.ArchiveTimeout()
    }

    const file = snapshot.getFile(pathname)
    return file.load('eager', blobStore).then(function () {
      const content = file.getContent()
      if (content === null) {
        return streamFileToArchive(pathname, file).catch(function (err) {
          throw new ProjectArchive.DownloadError(file.getHash()).withCause(err)
        })
      } else {
        archive.append(content, { name: pathname })
      }
    })
  }

  function streamFileToArchive(pathname, file) {
    return new BPromise(function (resolve, reject) {
      blobStore
        .getStream(file.getHash())
        .then(stream => {
          stream.on('error', reject)
          stream.on('end', resolve)
          archive.append(stream, { name: pathname })
        })
        .catch(reject)
    })
  }

  const addFilesToArchiveAndFinalize = BPromise.map(
    snapshot.getFilePathnames(),
    addFileToArchive,
    { concurrency: FETCH_CONCURRENCY }
  ).then(function () {
    archive.finalize()
  })

  const streamArchiveToFile = new BPromise(function (resolve, reject) {
    archive.on('error', reject)

    const stream = fs.createWriteStream(zipFilePath)
    stream.on('error', reject)
    stream.on('finish', resolve)
    archive.pipe(stream)
  })

  return BPromise.join(streamArchiveToFile, addFilesToArchiveAndFinalize)
}

module.exports = ProjectArchive
