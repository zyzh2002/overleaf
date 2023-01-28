/** @module */
'use strict'

const path = require('path')

/**
 * Regular expressions for Overleaf v2 taken from
 * https://github.com/sharelatex/web-sharelatex/blob/master/app/coffee/Features/Project/SafePath.coffee
 */

//
// Regex of characters that are invalid in filenames
//
// eslint-disable-next-line no-control-regex
const BAD_CHAR_RX = /[/*\u0000-\u001F\u007F\u0080-\u009F\uD800-\uDFFF]/g

//
// Regex of filename patterns that are invalid ("."  ".." and leading/trailing
// whitespace)
//
const BAD_FILE_RX = /(^\.$)|(^\.\.$)|(^\s+)|(\s+$)/g

//
// Put a block on filenames which match javascript property names, as they
// can cause exceptions where the code puts filenames into a hash. This is a
// temporary workaround until the code in other places is made safe against
// property names.
//
// See https://github.com/overleaf/write_latex/wiki/Using-javascript-Objects-as-Maps
//
const BLOCKED_FILE_RX =
  /^(prototype|constructor|toString|toLocaleString|valueOf|hasOwnProperty|isPrototypeOf|propertyIsEnumerable|__defineGetter__|__lookupGetter__|__defineSetter__|__lookupSetter__|__proto__)$/

//
// Maximum path length, in characters. This is fairly arbitrary.
//
const MAX_PATH = 1024

/**
 * Replace invalid characters and filename patterns in a filename with
 * underscores.
 */
function cleanPart(filename) {
  filename = filename.replace(BAD_CHAR_RX, '_')
  filename = filename.replace(BAD_FILE_RX, function (match) {
    return new Array(match.length + 1).join('_')
  })
  return filename
}

/**
 * All pathnames in a Snapshot must be clean. We want pathnames that:
 *
 * 1. are unambiguous (e.g. no `.`s or redundant path separators)
 * 2. do not allow directory traversal attacks (e.g. no `..`s or absolute paths)
 * 3. do not contain leading/trailing space
 * 4. do not contain the character '*' in filenames
 *
 * We normalise the pathname, split it by the separator and then clean each part
 * as a filename
 *
 * @param {string} pathname
 * @return {String}
 */
exports.clean = function (pathname) {
  pathname = path.normalize(pathname)
  pathname = pathname.replace(/\\/g, '/') // workaround for IE
  pathname = pathname.replace(/\/+/g, '/') // no multiple slashes
  pathname = pathname.replace(/^(\/.*)$/, '_$1') // no leading /
  pathname = pathname.replace(/^(.+)\/$/, '$1') // no trailing /
  pathname = pathname.replace(/^ *(.*)$/, '$1') // no leading spaces
  pathname = pathname.replace(/^(.*[^ ]) *$/, '$1') // no trailing spaces
  if (pathname.length === 0) pathname = '_'
  pathname = pathname.split('/').map(cleanPart).join('/')
  pathname = pathname.replace(BLOCKED_FILE_RX, '@$1')
  return pathname
}

/**
 * A pathname is clean (see clean) and not too long.
 *
 * @param {string} pathname
 * @return {Boolean}
 */
exports.isClean = function pathnameIsClean(pathname) {
  return (
    exports.clean(pathname) === pathname &&
    pathname.length <= MAX_PATH &&
    pathname.length > 0
  )
}
