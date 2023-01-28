'use strict'

const { expect } = require('chai')
const core = require('..')
const Change = core.Change
const File = core.File
const Operation = core.Operation

describe('Change', function () {
  describe('findBlobHashes', function () {
    it('finds blob hashes from operations', function () {
      const blobHashes = new Set()

      const change = Change.fromRaw({
        operations: [],
        timestamp: '2015-03-05T12:03:53.035Z',
        authors: [null],
      })

      change.findBlobHashes(blobHashes)
      expect(blobHashes.size).to.equal(0)

      // AddFile with content doesn't have a hash.
      change.pushOperation(Operation.addFile('a.txt', File.fromString('a')))
      change.findBlobHashes(blobHashes)
      expect(blobHashes.size).to.equal(0)

      // AddFile with hash should give us a hash.
      change.pushOperation(
        Operation.addFile('b.txt', File.fromHash(File.EMPTY_FILE_HASH))
      )
      change.findBlobHashes(blobHashes)
      expect(blobHashes.size).to.equal(1)
      expect(blobHashes.has(File.EMPTY_FILE_HASH)).to.be.true
    })
  })
})
