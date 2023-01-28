'use strict'

const assert = require('check-types').assert
const BPromise = require('bluebird')
const OError = require('@overleaf/o-error')

const FileMap = require('./file_map')
const V2DocVersions = require('./v2_doc_versions')

/**
 * @typedef {import("./types").BlobStore} BlobStore
 * @typedef {import("./change")} Change
 * @typedef {import("./operation/text_operation")} TextOperation
 */

/**
 * @classdesc A Snapshot represents the state of a {@link Project} at a
 *     particular version.
 */
class Snapshot {
  static fromRaw(raw) {
    assert.object(raw.files, 'bad raw.files')
    return new Snapshot(
      FileMap.fromRaw(raw.files),
      raw.projectVersion,
      V2DocVersions.fromRaw(raw.v2DocVersions)
    )
  }

  toRaw() {
    const raw = {
      files: this.fileMap.toRaw(),
    }
    if (this.projectVersion) raw.projectVersion = this.projectVersion
    if (this.v2DocVersions) raw.v2DocVersions = this.v2DocVersions.toRaw()
    return raw
  }

  /**
   * @constructor
   * @param {FileMap} [fileMap]
   * @param {string} [projectVersion]
   * @param {V2DocVersions} [v2DocVersions]
   */
  constructor(fileMap, projectVersion, v2DocVersions) {
    assert.maybe.instance(fileMap, FileMap, 'bad fileMap')

    this.fileMap = fileMap || new FileMap({})
    this.projectVersion = projectVersion
    this.v2DocVersions = v2DocVersions
  }

  /**
   * @return {string | null | undefined}
   */
  getProjectVersion() {
    return this.projectVersion
  }

  setProjectVersion(projectVersion) {
    assert.maybe.match(
      projectVersion,
      Snapshot.PROJECT_VERSION_RX,
      'Snapshot: bad projectVersion'
    )
    this.projectVersion = projectVersion
  }

  /**
   * @return {V2DocVersions | null | undefined}
   */
  getV2DocVersions() {
    return this.v2DocVersions
  }

  setV2DocVersions(v2DocVersions) {
    assert.maybe.instance(
      v2DocVersions,
      V2DocVersions,
      'Snapshot: bad v2DocVersions'
    )
    this.v2DocVersions = v2DocVersions
  }

  updateV2DocVersions(v2DocVersions) {
    // merge new v2DocVersions into this.v2DocVersions
    v2DocVersions.applyTo(this)
  }

  /**
   * The underlying file map.
   * @return {FileMap}
   */
  getFileMap() {
    return this.fileMap
  }

  /**
   * The pathnames of all of the files.
   *
   * @return {Array.<string>} in no particular order
   */
  getFilePathnames() {
    return this.fileMap.getPathnames()
  }

  /**
   * Get a File by its pathname.
   * @see FileMap#getFile
   */
  getFile(pathname) {
    return this.fileMap.getFile(pathname)
  }

  /**
   * Add the given file to the snapshot.
   * @see FileMap#addFile
   */
  addFile(pathname, file) {
    this.fileMap.addFile(pathname, file)
  }

  /**
   * Move or remove a file.
   * @see FileMap#moveFile
   */
  moveFile(pathname, newPathname) {
    this.fileMap.moveFile(pathname, newPathname)
  }

  /**
   * The number of files in the snapshot.
   *
   * @return {number}
   */
  countFiles() {
    return this.fileMap.countFiles()
  }

  /**
   * Edit the content of an editable file.
   *
   * Throws an error if no file with the given name exists.
   *
   * @param {string} pathname
   * @param {TextOperation} textOperation
   */
  editFile(pathname, textOperation) {
    const file = this.fileMap.getFile(pathname)
    if (!file) {
      throw new Snapshot.EditMissingFileError(
        `can't find file for editing: ${pathname}`
      )
    }
    file.edit(textOperation)
  }

  /**
   * Apply all changes in sequence. Modifies the snapshot in place.
   *
   * Ignore recoverable errors (caused by historical bad data) unless opts.strict is true
   *
   * @param {Change[]} changes
   * @param {object} opts
   * @param {boolean} opts.strict - do not ignore recoverable errors
   */
  applyAll(changes, opts) {
    for (const change of changes) {
      change.applyTo(this, opts)
    }
  }

  /**
   * If the Files in this Snapshot reference blob hashes, add them to the given
   * set.
   *
   * @param  {Set.<String>} blobHashes
   */
  findBlobHashes(blobHashes) {
    // eslint-disable-next-line array-callback-return
    this.fileMap.map(file => {
      const hash = file.getHash()
      if (hash) blobHashes.add(hash)
    })
  }

  /**
   * Load all of the files in this snapshot.
   *
   * @param {string} kind see {File#load}
   * @param {BlobStore} blobStore
   * @return {Promise}
   */
  loadFiles(kind, blobStore) {
    return BPromise.props(this.fileMap.map(file => file.load(kind, blobStore)))
  }

  /**
   * Store each of the files in this snapshot and return the raw snapshot for
   * long term storage.
   *
   * @param {BlobStore} blobStore
   * @param {number} [concurrency]
   * @return {Promise.<Object>}
   */
  store(blobStore, concurrency) {
    assert.maybe.number(concurrency, 'bad concurrency')

    const projectVersion = this.projectVersion
    const rawV2DocVersions = this.v2DocVersions
      ? this.v2DocVersions.toRaw()
      : undefined
    return this.fileMap
      .mapAsync(file => file.store(blobStore), concurrency)
      .then(rawFiles => {
        return {
          files: rawFiles,
          projectVersion,
          v2DocVersions: rawV2DocVersions,
        }
      })
  }

  /**
   * Create a deep clone of this snapshot.
   *
   * @return {Snapshot}
   */
  clone() {
    return Snapshot.fromRaw(this.toRaw())
  }
}

class EditMissingFileError extends OError {}
Snapshot.EditMissingFileError = EditMissingFileError

Snapshot.PROJECT_VERSION_RX_STRING = '^[0-9]+\\.[0-9]+$'
Snapshot.PROJECT_VERSION_RX = new RegExp(Snapshot.PROJECT_VERSION_RX_STRING)

module.exports = Snapshot
