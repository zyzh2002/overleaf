'use strict'

const BPromise = require('bluebird')
const { expect } = require('chai')
const fs = BPromise.promisifyAll(require('fs'))
const temp = require('temp')

const cleanup = require('./support/cleanup')
const fetch = require('./support/fetch')
const fixtures = require('./support/fixtures')
const { getZipEntries } = require('./support/unzip')

const { Snapshot, File } = require('overleaf-editor-core')

const { zipStore } = require('../../../../storage')

describe('zipStore', function () {
  beforeEach(cleanup.persistor)

  let zipFilePath
  beforeEach(function () {
    zipFilePath = temp.path({ suffix: '.zip' })
  })
  afterEach(async function () {
    try {
      await fs.unlinkAsync(zipFilePath)
    } catch (_error) {
      // Ignore.
    }
  })

  it('stores a snapshot in a zip file', async function () {
    const projectId = fixtures.docs.uninitializedProject.id
    const version = 1
    const testSnapshot = new Snapshot()
    testSnapshot.addFile('hello.txt', File.fromString('hello world'))

    const zipUrl = await zipStore.getSignedUrl(projectId, version)

    // Initially, there is no zip file; we should get a 404.
    const preZipResponse = await fetch(zipUrl)
    expect(preZipResponse.status).to.equal(404)

    // Build the zip file.
    await zipStore.storeZip(projectId, version, testSnapshot)

    // Now we should be able to fetch it.
    const postZipResponse = await fetch(zipUrl)
    expect(postZipResponse.status).to.equal(200)
    const zipBuffer = await postZipResponse.buffer()
    await fs.writeFileAsync(zipFilePath, zipBuffer)
    const entries = await getZipEntries(zipFilePath)
    expect(entries.length).to.equal(1)
    expect(entries[0].fileName).to.equal('hello.txt')
  })
})
