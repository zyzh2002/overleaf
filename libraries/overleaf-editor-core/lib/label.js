'use strict'

const assert = require('check-types').assert

/**
 * @constructor
 * @param {string} text
 * @classdesc
 * A user-configurable label that can be attached to a specific change. Labels
 * are not versioned, and they are not stored alongside the Changes in Chunks.
 * They are instead intended to provide external markers into the history of the
 * project.
 */
function Label(text, authorId, timestamp, version) {
  assert.string(text, 'bad text')
  assert.maybe.integer(authorId, 'bad author id')
  assert.date(timestamp, 'bad timestamp')
  assert.integer(version, 'bad version')

  this.text = text
  this.authorId = authorId
  this.timestamp = timestamp
  this.version = version
}

/**
 * Create a Label from its raw form.
 *
 * @param {Object} raw
 * @return {Label}
 */
Label.fromRaw = function labelFromRaw(raw) {
  return new Label(raw.text, raw.authorId, new Date(raw.timestamp), raw.version)
}

/**
 * Convert the Label to raw form for transmission.
 *
 * @return {Object}
 */
Label.prototype.toRaw = function labelToRaw() {
  return {
    text: this.text,
    authorId: this.authorId,
    timestamp: this.timestamp.toISOString(),
    version: this.version,
  }
}

/**
 * @return {string}
 */
Label.prototype.getText = function () {
  return this.text
}

/**
 * The ID of the author, if any. Note that we now require all saved versions to
 * have an author, but this was not always the case, so we have to allow nulls
 * here for historical reasons.
 *
 * @return {number | null | undefined}
 */
Label.prototype.getAuthorId = function () {
  return this.authorId
}

/**
 * @return {Date}
 */
Label.prototype.getTimestamp = function () {
  return this.timestamp
}

/**
 * @return {number | undefined}
 */
Label.prototype.getVersion = function () {
  return this.version
}

module.exports = Label
