'use strict'

const BPromise = require('bluebird')
const _ = require('lodash')

const assert = require('check-types').assert
const OError = require('@overleaf/o-error')

const File = require('./file')
const safePathname = require('./safe_pathname')

/**
 * A set of {@link File}s. Several properties are enforced on the pathnames:
 *
 * 1. File names and paths are case sensitive and can differ by case alone. This
 * is consistent with most Linux file systems, but it is not consistent with
 * Windows or OS X. Ideally, we would be case-preserving and case insensitive,
 * like they are. And we used to be, but it caused too many incompatibilities
 * with the old system, which was case sensitive. See
 * https://github.com/overleaf/overleaf-ot-prototype/blob/
 *   19ed046c09f5a4d14fa12b3ea813ce0d977af88a/editor/core/lib/file_map.js
 * for an implementation of this map with those properties.
 *
 * 2. Uniqueness: No two pathnames are the same.
 *
 * 3. No type conflicts: A pathname cannot refer to both a file and a directory
 * within the same snapshot. That is, you can't have pathnames `a` and `a/b` in
 * the same file map; {@see FileMap#wouldConflict}.
 *
 * @param {Object.<String, File>} files
 */
class FileMap {
  constructor(files) {
    // create bare object for use as Map
    // http://ryanmorr.com/true-hash-maps-in-javascript/
    this.files = Object.create(null)
    _.assign(this.files, files)
    checkPathnamesAreUnique(this.files)
    checkPathnamesDoNotConflict(this)
  }

  static fromRaw(raw) {
    assert.object(raw, 'bad raw files')
    return new FileMap(_.mapValues(raw, File.fromRaw))
  }

  /**
   * Convert to raw object for serialization.
   *
   * @return {Object}
   */
  toRaw() {
    function fileToRaw(file) {
      return file.toRaw()
    }
    return _.mapValues(this.files, fileToRaw)
  }

  /**
   * Create the given file.
   *
   * @param {string} pathname
   * @param {File} file
   */
  addFile(pathname, file) {
    checkPathname(pathname)
    assert.object(file, 'bad file')
    checkNewPathnameDoesNotConflict(this, pathname)
    addFile(this.files, pathname, file)
  }

  /**
   * Remove the given file.
   *
   * @param {string} pathname
   */
  removeFile(pathname) {
    checkPathname(pathname)

    const key = findPathnameKey(this.files, pathname)
    if (!key) {
      throw new FileMap.FileNotFoundError(pathname)
    }
    delete this.files[key]
  }

  /**
   * Move or remove a file. If the origin file does not exist, or if the old
   * and new paths are identical, this has no effect.
   *
   * @param {string} pathname
   * @param {string} newPathname if a blank string, {@link FileMap#removeFile}
   */
  moveFile(pathname, newPathname) {
    if (pathname === newPathname) return
    if (newPathname === '') return this.removeFile(pathname)
    checkPathname(pathname)
    checkPathname(newPathname)
    checkNewPathnameDoesNotConflict(this, newPathname, pathname)

    const key = findPathnameKey(this.files, pathname)
    if (!key) {
      throw new FileMap.FileNotFoundError(pathname)
    }
    const file = this.files[key]
    delete this.files[key]

    addFile(this.files, newPathname, file)
  }

  /**
   * The number of files in the file map.
   *
   * @return {number}
   */
  countFiles() {
    return _.size(this.files)
  }

  /**
   * Get a file by its pathname.
   *
   * @param {string} pathname
   * @return {File | null | undefined}
   */
  getFile(pathname) {
    const key = findPathnameKey(this.files, pathname)
    return key && this.files[key]
  }

  /**
   * Whether the given pathname conflicts with any file in the map.
   *
   * Paths conflict in type if one path is a strict prefix of the other path. For
   * example, 'a/b' conflicts with 'a', because in the former case 'a' is a
   * folder, but in the latter case it is a file. Similarly, the pathname 'a/b/c'
   * conflicts with 'a' and 'a/b', but it does not conflict with 'a/b/c', 'a/x',
   * or 'a/b/x'. (In our case, identical paths don't conflict, because AddFile
   * and MoveFile overwrite existing files.)
   *
   * @param {string} pathname
   * @param {string} [ignoredPathname] pretend this pathname does not exist
   */
  wouldConflict(pathname, ignoredPathname) {
    checkPathname(pathname)
    assert.maybe.string(ignoredPathname)
    const pathnames = this.getPathnames()
    const dirname = pathname + '/'
    // Check the filemap to see whether the supplied pathname is a
    // parent of any entry, or any entry is a parent of the pathname.
    for (let i = 0; i < pathnames.length; i++) {
      // First check if pathname is a strict prefix of pathnames[i] (and that
      // pathnames[i] is not ignored)
      if (
        pathnames[i].startsWith(dirname) &&
        !pathnamesEqual(pathnames[i], ignoredPathname)
      ) {
        return true
      }
      // Now make the reverse check, whether pathnames[i] is a strict prefix of
      // pathname. To avoid expensive string concatenation on each pathname we
      // first perform a partial check with a.startsWith(b), and then do the
      // full check for a subsequent '/' if this passes.  This saves about 25%
      // of the runtime.  Again only return a conflict if pathnames[i] is not
      // ignored.
      if (
        pathname.startsWith(pathnames[i]) &&
        pathname.length > pathnames[i].length &&
        pathname[pathnames[i].length] === '/' &&
        !pathnamesEqual(pathnames[i], ignoredPathname)
      ) {
        return true
      }
    }
    // No conflicts - after excluding ignoredPathname, there were no entries
    // which were a strict prefix of pathname, and pathname was not a strict
    // prefix of any entry.
    return false
  }

  /** @see Snapshot#getFilePathnames */
  getPathnames() {
    return _.keys(this.files)
  }

  /**
   * Map the files in this map to new values.
   * @param {function} iteratee
   * @return {Object}
   */
  map(iteratee) {
    return _.mapValues(this.files, iteratee)
  }

  /**
   * Map the files in this map to new values asynchronously, with an optional
   * limit on concurrency.
   * @param {function} iteratee like for _.mapValues
   * @param {number} [concurrency] as for BPromise.map
   * @return {Object}
   */
  mapAsync(iteratee, concurrency) {
    assert.maybe.number(concurrency, 'bad concurrency')

    const pathnames = this.getPathnames()
    return BPromise.map(
      pathnames,
      file => {
        return iteratee(this.getFile(file), file, pathnames)
      },
      { concurrency: concurrency || 1 }
    ).then(files => {
      return _.zipObject(pathnames, files)
    })
  }
}

class PathnameError extends OError {}
FileMap.PathnameError = PathnameError

class NonUniquePathnameError extends PathnameError {
  constructor(pathnames) {
    super('pathnames are not unique: ' + pathnames, { pathnames })
    this.pathnames = pathnames
  }
}
FileMap.NonUniquePathnameError = NonUniquePathnameError

class BadPathnameError extends PathnameError {
  constructor(pathname) {
    super(pathname + ' is not a valid pathname', { pathname })
    this.pathname = pathname
  }
}
FileMap.BadPathnameError = BadPathnameError

class PathnameConflictError extends PathnameError {
  constructor(pathname) {
    super(`pathname '${pathname}' conflicts with another file`, { pathname })
    this.pathname = pathname
  }
}
FileMap.PathnameConflictError = PathnameConflictError

class FileNotFoundError extends PathnameError {
  constructor(pathname) {
    super(`file ${pathname} does not exist`, { pathname })
    this.pathname = pathname
  }
}
FileMap.FileNotFoundError = FileNotFoundError

function pathnamesEqual(pathname0, pathname1) {
  return pathname0 === pathname1
}

function pathnamesAreUnique(files) {
  const keys = _.keys(files)
  return _.uniqWith(keys, pathnamesEqual).length === keys.length
}

function checkPathnamesAreUnique(files) {
  if (pathnamesAreUnique(files)) return
  throw new FileMap.NonUniquePathnameError(_.keys(files))
}

function checkPathname(pathname) {
  assert.nonEmptyString(pathname, 'bad pathname')
  if (safePathname.isClean(pathname)) return
  throw new FileMap.BadPathnameError(pathname)
}

function checkNewPathnameDoesNotConflict(fileMap, pathname, ignoredPathname) {
  if (fileMap.wouldConflict(pathname, ignoredPathname)) {
    throw new FileMap.PathnameConflictError(pathname)
  }
}

function checkPathnamesDoNotConflict(fileMap) {
  const pathnames = fileMap.getPathnames()
  // check pathnames for validity first
  pathnames.forEach(checkPathname)
  // convert pathnames to candidate directory names
  const dirnames = []
  for (let i = 0; i < pathnames.length; i++) {
    dirnames[i] = pathnames[i] + '/'
  }
  // sort in lexical order and check if one directory contains another
  dirnames.sort()
  for (let i = 0; i < dirnames.length - 1; i++) {
    if (dirnames[i + 1].startsWith(dirnames[i])) {
      // strip trailing slash to get original pathname
      const conflictPathname = dirnames[i + 1].substr(0, -1)
      throw new FileMap.PathnameConflictError(conflictPathname)
    }
  }
}

//
// This function is somewhat vestigial: it was used when this map used
// case-insensitive pathname comparison. We could probably simplify some of the
// logic in the callers, but in the hope that we will one day return to
// case-insensitive semantics, we've just left things as-is for now.
//
function findPathnameKey(files, pathname) {
  // we can check for the key without worrying about properties
  // in the prototype because we are now using a bare object/
  if (pathname in files) return pathname
}

function addFile(files, pathname, file) {
  const key = findPathnameKey(files, pathname)
  if (key) delete files[key]
  files[pathname] = file
}

module.exports = FileMap
