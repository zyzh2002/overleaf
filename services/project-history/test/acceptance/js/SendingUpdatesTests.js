import { expect } from 'chai'
import Settings from '@overleaf/settings'
import assert from 'assert'
import async from 'async'
import crypto from 'crypto'
import { ObjectId } from 'mongodb'
import nock from 'nock'
import * as ProjectHistoryClient from './helpers/ProjectHistoryClient.js'
import * as ProjectHistoryApp from './helpers/ProjectHistoryApp.js'

const MockHistoryStore = () => nock('http://localhost:3100')
const MockFileStore = () => nock('http://localhost:3009')
const MockWeb = () => nock('http://localhost:3000')

// Some helper methods to make the tests more compact
function slTextUpdate(historyId, doc, userId, v, ts, op) {
  return {
    projectHistoryId: historyId,
    doc: doc.id,
    op,
    v,

    meta: {
      user_id: userId,
      ts: ts.getTime(),
      pathname: doc.pathname,
      doc_length: doc.length,
    },
  }
}

function slAddDocUpdate(historyId, doc, userId, ts, docLines) {
  return {
    projectHistoryId: historyId,
    pathname: doc.pathname,
    docLines,
    doc: doc.id,
    meta: { user_id: userId, ts: ts.getTime() },
  }
}

function slAddDocUpdateWithVersion(
  historyId,
  doc,
  userId,
  ts,
  docLines,
  projectVersion
) {
  const result = slAddDocUpdate(historyId, doc, userId, ts, docLines)
  result.version = projectVersion
  return result
}

function slAddFileUpdate(historyId, file, userId, ts, projectId) {
  return {
    projectHistoryId: historyId,
    pathname: file.pathname,
    url: `http://localhost:3009/project/${projectId}/file/${file.id}`,
    file: file.id,
    meta: { user_id: userId, ts: ts.getTime() },
  }
}

function slRenameUpdate(historyId, doc, userId, ts, pathname, newPathname) {
  return {
    projectHistoryId: historyId,
    pathname,
    new_pathname: newPathname,
    doc: doc.id,
    meta: { user_id: userId, ts: ts.getTime() },
  }
}

function olTextUpdate(doc, userId, ts, textOperation, v) {
  return {
    v2Authors: [userId],
    timestamp: ts.toJSON(),
    authors: [],

    operations: [
      {
        pathname: doc.pathname.replace(/^\//, ''), // Strip leading /
        textOperation,
      },
    ],

    v2DocVersions: {
      [doc.id]: {
        pathname: doc.pathname.replace(/^\//, ''), // Strip leading /
        v: v || 1,
      },
    },
  }
}

function olTextUpdates(doc, userId, ts, textOperations, v) {
  return {
    v2Authors: [userId],
    timestamp: ts.toJSON(),
    authors: [],

    operations: textOperations.map(textOperation => ({
      // Strip leading /
      pathname: doc.pathname.replace(/^\//, ''),

      textOperation,
    })),

    v2DocVersions: {
      [doc.id]: {
        pathname: doc.pathname.replace(/^\//, ''), // Strip leading /
        v: v || 1,
      },
    },
  }
}

function olRenameUpdate(doc, userId, ts, pathname, newPathname) {
  return {
    v2Authors: [userId],
    timestamp: ts.toJSON(),
    authors: [],

    operations: [
      {
        pathname,
        newPathname,
      },
    ],
  }
}

function olAddDocUpdate(doc, userId, ts, fileHash) {
  return {
    v2Authors: [userId],
    timestamp: ts.toJSON(),
    authors: [],

    operations: [
      {
        pathname: doc.pathname.replace(/^\//, ''), // Strip leading /
        file: {
          hash: fileHash,
        },
      },
    ],
  }
}

function olAddDocUpdateWithVersion(doc, userId, ts, fileHash, version) {
  const result = olAddDocUpdate(doc, userId, ts, fileHash)
  result.projectVersion = version
  return result
}

function olAddFileUpdate(file, userId, ts, fileHash) {
  return {
    v2Authors: [userId],
    timestamp: ts.toJSON(),
    authors: [],

    operations: [
      {
        pathname: file.pathname.replace(/^\//, ''), // Strip leading /
        file: {
          hash: fileHash,
        },
      },
    ],
  }
}

describe('Sending Updates', function () {
  const historyId = ObjectId().toString()

  beforeEach(function (done) {
    this.timestamp = new Date()

    ProjectHistoryApp.ensureRunning(error => {
      if (error) {
        return done(error)
      }
      this.userId = ObjectId().toString()
      this.projectId = ObjectId().toString()
      this.docId = ObjectId().toString()

      this.doc = {
        id: this.docId,
        pathname: '/main.tex',
        length: 5,
      }

      MockHistoryStore().post('/api/projects').reply(200, {
        projectId: historyId,
      })
      MockWeb()
        .get(`/project/${this.projectId}/details`)
        .reply(200, {
          name: 'Test Project',
          overleaf: {
            history: {
              id: historyId,
            },
          },
        })
      ProjectHistoryClient.initializeProject(historyId, done)
    })
  })

  afterEach(function () {
    nock.cleanAll()
  })

  describe('basic update types', function () {
    beforeEach(function () {
      MockHistoryStore()
        .get(`/api/projects/${historyId}/latest/history`)
        .reply(200, {
          chunk: {
            startVersion: 0,
            history: {
              snapshot: {},
              changes: [],
            },
          },
        })
    })

    it('should send add doc updates to the history store', function (done) {
      const fileHash = '0a207c060e61f3b88eaee0a8cd0696f46fb155eb'

      const createBlob = MockHistoryStore()
        .put(`/api/projects/${historyId}/blobs/${fileHash}`, 'a\nb')
        .reply(201)

      const addFile = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olAddDocUpdate(this.doc, this.userId, this.timestamp, fileHash),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slAddDocUpdate(
                historyId,
                this.doc,
                this.userId,
                this.timestamp,
                'a\nb'
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createBlob.isDone(),
            '/api/projects/:historyId/blobs/:hash should have been called'
          )
          assert(
            addFile.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })

    it('should strip non-BMP characters in add doc updates before sending to the history store', function (done) {
      const fileHash = '11509fe05a41f9cdc51ea081342b5a4fc7c8d0fc'

      const createBlob = MockHistoryStore()
        .put(
          `/api/projects/${historyId}/blobs/${fileHash}`,
          'a\nb\uFFFD\uFFFDc'
        )
        .reply(201)

      const addFile = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olAddDocUpdate(this.doc, this.userId, this.timestamp, fileHash),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slAddDocUpdate(
                historyId,
                this.doc,
                this.userId,
                this.timestamp,
                'a\nb\uD800\uDC00c'
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createBlob.isDone(),
            '/api/projects/:historyId/blobs/:hash should have been called'
          )
          assert(
            addFile.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })

    it('should send text updates to the history store', function (done) {
      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olTextUpdate(this.doc, this.userId, this.timestamp, [3, '\nc', 2]),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(
                historyId,
                this.doc,
                this.userId,
                1,
                this.timestamp,
                [{ p: 3, i: '\nc' }]
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createChange.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })

    it('should send renames to the history store', function (done) {
      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olRenameUpdate(
              this.doc,
              this.userId,
              this.timestamp,
              'main.tex',
              'main2.tex'
            ),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slRenameUpdate(
                historyId,
                this.doc,
                this.userId,
                this.timestamp,
                '/main.tex',
                '/main2.tex'
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createChange.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })

    it('should send add file updates to the history store', function (done) {
      const file = {
        id: ObjectId().toString(),
        pathname: '/test.png',
        contents: Buffer.from([1, 2, 3]),
        hash: 'aed2973e4b8a7ff1b30ff5c4751e5a2b38989e74',
      }

      const fileStoreRequest = MockFileStore()
        .get(`/project/${this.projectId}/file/${file.id}`)
        .reply(200, file.contents)

      const createBlob = MockHistoryStore()
        .put(`/api/projects/${historyId}/blobs/${file.hash}`, file.contents)
        .reply(201)

      const addFile = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olAddFileUpdate(file, this.userId, this.timestamp, file.hash),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slAddFileUpdate(
                historyId,
                file,
                this.userId,
                this.timestamp,
                this.projectId
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            fileStoreRequest.isDone(),
            `/project/${this.projectId}/file/${file.id} should have been called`
          )
          assert(
            createBlob.isDone(),
            `/api/projects/${historyId}/latest/files should have been called`
          )
          assert(
            addFile.isDone(),
            `/api/projects/${historyId}/latest/files should have been called`
          )
          done()
        }
      )
    })

    it('should send a stub to the history store when the file is large', function (done) {
      const fileContents = Buffer.alloc(Settings.maxFileSizeInBytes + 1, 'X')
      const fileSize = Buffer.byteLength(fileContents)

      const fileHash = crypto
        .createHash('sha1')
        .update('blob ' + fileSize + '\x00')
        .update(fileContents, 'utf8')
        .digest('hex')

      const file = {
        id: ObjectId().toString(),
        pathname: '/large.png',
        contents: fileContents,
        hash: fileHash,
      }

      const stubContents = [
        'FileTooLargeError v1',
        'File too large to be stored in history service',
        `id project-${this.projectId}-file-${file.id}`,
        `size ${fileSize} bytes`,
        `hash ${fileHash}`,
        '\0', // null byte to make this a binary file
      ].join('\n')

      const stubHash = crypto
        .createHash('sha1')
        .update('blob ' + Buffer.byteLength(stubContents) + '\x00')
        .update(stubContents, 'utf8')
        .digest('hex')

      const stub = {
        id: file.id,
        pathname: file.pathname,
        contents: stubContents,
        hash: stubHash,
      }

      const fileStoreRequest = MockFileStore()
        .get(`/project/${this.projectId}/file/${file.id}`)
        .reply(200, file.contents)

      const createBlob = MockHistoryStore()
        .put(`/api/projects/${historyId}/blobs/${stub.hash}`, stub.contents)
        .reply(201)

      const addFile = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olAddFileUpdate(stub, this.userId, this.timestamp, stub.hash),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slAddFileUpdate(
                historyId,
                file,
                this.userId,
                this.timestamp,
                this.projectId
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            addFile.isDone(),
            `/api/projects/${historyId}/latest/files should have been called`
          )
          assert(
            createBlob.isDone(),
            `/api/projects/${historyId}/latest/files should have been called`
          )
          assert(
            fileStoreRequest.isDone(),
            `/project/${this.projectId}/file/${file.id} should have been called`
          )
          done()
        }
      )
    })

    it('should ignore comment ops', function (done) {
      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olTextUpdate(this.doc, this.userId, this.timestamp, [3, '\nc', 2]),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(
                historyId,
                this.doc,
                this.userId,
                1,
                this.timestamp,
                [
                  { p: 3, i: '\nc' },
                  { p: 3, c: '\nc' },
                ]
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(
                historyId,
                this.doc,
                this.userId,
                2,
                this.timestamp,
                [{ p: 2, c: 'b' }]
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createChange.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })

    it('should be able to process lots of updates in batches', function (done) {
      const BATCH_SIZE = 500
      const createFirstChangeBatch = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olTextUpdate(
              this.doc,
              this.userId,
              this.timestamp,
              ['a'.repeat(BATCH_SIZE), 6],
              BATCH_SIZE - 1
            ),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)
      const createSecondChangeBatch = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olTextUpdate(
              this.doc,
              this.userId,
              this.timestamp,
              ['a'.repeat(50), BATCH_SIZE + 6],
              BATCH_SIZE - 1 + 50
            ),
          ])
          return true
        })
        .query({ end_version: 500 })
        .reply(204)
      // these need mocking again for the second batch
      MockHistoryStore()
        .get(`/api/projects/${historyId}/latest/history`)
        .reply(200, {
          chunk: {
            startVersion: BATCH_SIZE,
            history: {
              snapshot: {},
              changes: [],
            },
          },
        })
      MockWeb()
        .get(`/project/${this.projectId}/details`)
        .reply(200, {
          name: 'Test Project',
          overleaf: {
            history: {
              id: historyId,
            },
          },
        })

      const pushChange = (n, cb) => {
        this.doc.length += 1
        ProjectHistoryClient.pushRawUpdate(
          this.projectId,
          slTextUpdate(historyId, this.doc, this.userId, n, this.timestamp, [
            { p: 0, i: 'a' },
          ]),
          cb
        )
      }

      async.series(
        [
          cb => {
            async.times(BATCH_SIZE + 50, pushChange, cb)
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createFirstChangeBatch.isDone(),
            `/api/projects/${historyId}/changes should have been called for the first batch`
          )
          assert(
            createSecondChangeBatch.isDone(),
            `/api/projects/${historyId}/changes should have been called for the second batch`
          )
          done()
        }
      )
    })
  })

  describe('compressing updates', function () {
    beforeEach(function () {
      MockHistoryStore()
        .get(`/api/projects/${historyId}/latest/history`)
        .reply(200, {
          chunk: {
            startVersion: 0,
            history: {
              snapshot: {},
              changes: [],
            },
          },
        })
    })

    it('should concat adjacent text updates', function (done) {
      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olTextUpdate(
              this.doc,
              this.userId,
              this.timestamp,
              [3, 'foobaz', 2],
              2
            ),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(
                historyId,
                this.doc,
                this.userId,
                1,
                this.timestamp,
                [
                  { p: 3, i: 'foobar' },
                  { p: 6, d: 'bar' },
                ]
              ),
              cb
            )
            this.doc.length += 3
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(
                historyId,
                this.doc,
                this.userId,
                2,
                this.timestamp,
                [{ p: 6, i: 'baz' }]
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createChange.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })

    it('should take the timestamp of the first update', function (done) {
      const timestamp1 = new Date(this.timestamp)
      const timestamp2 = new Date(this.timestamp.getTime() + 10000)
      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olTextUpdate(
              this.doc,
              this.userId,
              timestamp1,
              [3, 'foobaz', 2],
              2
            ),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(historyId, this.doc, this.userId, 1, timestamp1, [
                { p: 3, i: 'foo' },
              ]),
              cb
            )
            this.doc.length += 3
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(historyId, this.doc, this.userId, 2, timestamp2, [
                { p: 6, i: 'baz' },
              ]),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createChange.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })

    it('should not concat updates more than 60 seconds apart', function (done) {
      const timestamp1 = new Date(this.timestamp)
      const timestamp2 = new Date(this.timestamp.getTime() + 120000)
      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olTextUpdate(this.doc, this.userId, timestamp1, [3, 'foo', 2], 1),
            olTextUpdate(this.doc, this.userId, timestamp2, [6, 'baz', 2], 2),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(historyId, this.doc, this.userId, 1, timestamp1, [
                { p: 3, i: 'foo' },
              ]),
              cb
            )
            this.doc.length += 3
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(historyId, this.doc, this.userId, 2, timestamp2, [
                { p: 6, i: 'baz' },
              ]),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createChange.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })

    it('should not concat updates with different user_ids', function (done) {
      const userId1 = ObjectId().toString()
      const userId2 = ObjectId().toString()

      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olTextUpdate(this.doc, userId1, this.timestamp, [3, 'foo', 2], 1),
            olTextUpdate(this.doc, userId2, this.timestamp, [6, 'baz', 2], 2),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(historyId, this.doc, userId1, 1, this.timestamp, [
                { p: 3, i: 'foo' },
              ]),
              cb
            )
            this.doc.length += 3
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(historyId, this.doc, userId2, 2, this.timestamp, [
                { p: 6, i: 'baz' },
              ]),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createChange.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })

    it('should not concat updates with different docs', function (done) {
      const doc1 = {
        id: ObjectId().toString(),
        pathname: '/doc1.tex',
        length: 10,
      }
      const doc2 = {
        id: ObjectId().toString(),
        pathname: '/doc2.tex',
        length: 10,
      }

      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olTextUpdate(doc1, this.userId, this.timestamp, [3, 'foo', 7], 1),
            olTextUpdate(doc2, this.userId, this.timestamp, [6, 'baz', 4], 2),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(historyId, doc1, this.userId, 1, this.timestamp, [
                { p: 3, i: 'foo' },
              ]),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(historyId, doc2, this.userId, 2, this.timestamp, [
                { p: 6, i: 'baz' },
              ]),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createChange.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })

    it('should not send updates without any ops', function (done) {
      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            // These blank ops can get sent by doc-updater on setDocs from Dropbox that don't change anything
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(
                historyId,
                this.doc,
                this.userId,
                1,
                this.timestamp,
                []
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            !createChange.isDone(),
            `/api/projects/${historyId}/changes should not have been called`
          )
          done()
        }
      )
    })

    it('should not send ops that compress to nothing', function (done) {
      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(
                historyId,
                this.doc,
                this.userId,
                1,
                this.timestamp,
                [{ i: 'foo', p: 3 }]
              ),
              cb
            )
            this.doc.length += 3
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(
                historyId,
                this.doc,
                this.userId,
                2,
                this.timestamp,
                [{ d: 'foo', p: 3 }]
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            !createChange.isDone(),
            `/api/projects/${historyId}/changes should not have been called`
          )
          done()
        }
      )
    })

    it('should not send ops from a diff that are blank', function (done) {
      this.doc.length = 300
      // Test case taken from a real life document where it was generating blank insert and
      // delete ops from a diff, and the blank delete was erroring on the OL history from
      // a text operation like [42, 0, 512], where the 0 was invalid.
      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olTextUpdates(this.doc, this.userId, this.timestamp, [
              [
                87,
                -1,
                67,
                '|l|ll|}\n\\hline',
                -4,
                30,
                ' \\hline',
                87,
                ' \\\\ \\hline',
                24,
              ],
            ]),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(
                historyId,
                this.doc,
                this.userId,
                1,
                this.timestamp,
                [
                  {
                    p: 73,
                    d: '\\begin{table}[h]\n\\centering\n\\caption{My caption}\n\\label{my-label}\n\\begin{tabular}{lll}\n               & A   & B   \\\\\nLiter t up     & 2   & 1   \\\\\nLiter Whiskey  & 1   & 2   \\\\\nPris pr. liter & 200 & 250\n\\end{tabular}\n\\end{table}',
                  },
                  {
                    p: 73,
                    i: '\\begin{table}[]\n\\centering\n\\caption{My caption}\n\\label{my-label}\n\\begin{tabular}{|l|ll|}\n\\hline\n               & A   & B   \\\\ \\hline\nLiter t up     & 2   & 1   \\\\\nLiter Whiskey  & 1   & 2   \\\\\nPris pr. liter & 200 & 250 \\\\ \\hline\n\\end{tabular}\n\\end{table}',
                  },
                ]
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createChange.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })

    it('should not concat text updates across project structure ops', function (done) {
      const newDoc = {
        id: ObjectId().toString(),
        pathname: '/main.tex',
        hash: '0a207c060e61f3b88eaee0a8cd0696f46fb155eb',
        docLines: 'a\nb',
      }

      MockHistoryStore()
        .put(`/api/projects/${historyId}/blobs/${newDoc.hash}`)
        .reply(201)

      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olTextUpdate(
              this.doc,
              this.userId,
              this.timestamp,
              [3, 'foo', 2],
              1
            ),
            olAddDocUpdate(newDoc, this.userId, this.timestamp, newDoc.hash),
            olTextUpdate(
              this.doc,
              this.userId,
              this.timestamp,
              [6, 'baz', 2],
              2
            ),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(
                historyId,
                this.doc,
                this.userId,
                1,
                this.timestamp,
                [
                  { p: 3, i: 'foobar' },
                  { p: 6, d: 'bar' },
                ]
              ),
              cb
            )
            this.doc.length += 3
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slAddDocUpdate(
                historyId,
                newDoc,
                this.userId,
                this.timestamp,
                newDoc.docLines
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(
                historyId,
                this.doc,
                this.userId,
                2,
                this.timestamp,
                [{ p: 6, i: 'baz' }]
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createChange.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })

    it('should track the doc length when splitting ops', function (done) {
      this.doc.length = 10

      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olTextUpdate(this.doc, this.userId, this.timestamp, [3, -3, 4], 1),
            olTextUpdate(
              this.doc,
              this.userId,
              this.timestamp,
              [3, 'barbaz', 4],
              2
            ), // This has a base length of 10
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(
                historyId,
                this.doc,
                this.userId,
                1,
                this.timestamp,
                [
                  { p: 3, d: 'foo' },
                  { p: 3, i: 'bar' }, // Make sure the length of the op generated from this is 7, not 10
                ]
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(
                historyId,
                this.doc,
                this.userId,
                2,
                this.timestamp,
                [{ p: 6, i: 'baz' }]
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createChange.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })
  })

  describe('with bad pathnames', function () {
    beforeEach(function () {
      MockHistoryStore()
        .get(`/api/projects/${historyId}/latest/history`)
        .reply(200, {
          chunk: {
            startVersion: 0,
            history: {
              snapshot: {},
              changes: [],
            },
          },
        })
    })

    it('should replace \\ with _ and workaround * in pathnames', function (done) {
      const doc = {
        id: this.doc.id,
        pathname: '\\main.tex',
        hash: 'b07b6b7a27667965f733943737124395c7577bea',
        docLines: 'aaabbbccc',
        length: 9,
      }

      MockHistoryStore()
        .put(`/api/projects/${historyId}/blobs/${doc.hash}`)
        .reply(201)

      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olAddDocUpdate(
              { id: doc.id, pathname: '_main.tex' },
              this.userId,
              this.timestamp,
              doc.hash
            ),
            olRenameUpdate(
              { id: doc.id, pathname: '_main.tex' },
              this.userId,
              this.timestamp,
              '_main.tex',
              '_main2.tex'
            ),
            olTextUpdate(
              { id: doc.id, pathname: '_main2.tex' },
              this.userId,
              this.timestamp,
              [3, 'foo', 6],
              2
            ),
            olRenameUpdate(
              { id: doc.id, pathname: '_main2.tex' },
              this.userId,
              this.timestamp,
              '_main2.tex',
              '_main__ASTERISK__.tex'
            ),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slAddDocUpdate(
                historyId,
                doc,
                this.userId,
                this.timestamp,
                doc.docLines
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slRenameUpdate(
                historyId,
                doc,
                this.userId,
                this.timestamp,
                '/\\main.tex',
                '/\\main2.tex'
              ),
              cb
            )
            doc.pathname = '\\main2.tex'
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(historyId, doc, this.userId, 2, this.timestamp, [
                { p: 3, i: 'foo' },
              ]),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slRenameUpdate(
                historyId,
                doc,
                this.userId,
                this.timestamp,
                '/\\main2.tex',
                '/\\main*.tex'
              ),
              cb
            )
            doc.pathname = '\\main*.tex'
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createChange.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })

    it('should workaround pathnames beginning with spaces', function (done) {
      const doc = {
        id: this.doc.id,
        pathname: 'main.tex',
        hash: 'b07b6b7a27667965f733943737124395c7577bea',
        docLines: 'aaabbbccc',
        length: 9,
      }

      MockHistoryStore()
        .put(`/api/projects/${historyId}/blobs/${doc.hash}`)
        .reply(201)

      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olAddDocUpdate(
              { id: doc.id, pathname: 'main.tex' },
              this.userId,
              this.timestamp,
              doc.hash
            ),
            olRenameUpdate(
              { id: doc.id },
              this.userId,
              this.timestamp,
              'main.tex',
              'foo/__SPACE__main.tex'
            ),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slAddDocUpdate(
                historyId,
                doc,
                this.userId,
                this.timestamp,
                doc.docLines
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slRenameUpdate(
                historyId,
                doc,
                this.userId,
                this.timestamp,
                '/main.tex',
                '/foo/ main.tex'
              ),
              cb
            )
            doc.pathname = '/foo/ main.tex'
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createChange.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })
  })

  describe('with bad response from filestore', function () {
    beforeEach(function () {
      MockHistoryStore()
        .get(`/api/projects/${historyId}/latest/history`)
        .reply(200, {
          chunk: {
            startVersion: 0,
            history: {
              snapshot: {},
              changes: [],
            },
          },
        })
    })

    it('should return a 500 if the filestore returns a 500', function (done) {
      const file = {
        id: ObjectId().toString(),
        pathname: '/test.png',
        contents: Buffer.from([1, 2, 3]),
        hash: 'aed2973e4b8a7ff1b30ff5c4751e5a2b38989e74',
      }

      const fileStoreRequest = MockFileStore()
        .get(`/project/${this.projectId}/file/${file.id}`)
        .reply(500)

      const createBlob = MockHistoryStore()
        .put(`/api/projects/${historyId}/blobs/${file.hash}`, file.contents)
        .reply(201)

      const addFile = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olAddFileUpdate(file, this.userId, this.timestamp, file.hash),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slAddFileUpdate(
                historyId,
                file,
                this.userId,
                this.timestamp,
                this.projectId
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(
              this.projectId,
              { allowErrors: true },
              (error, res) => {
                if (error) {
                  return cb(error)
                }
                expect(res.statusCode).to.equal(500)
                cb()
              }
            )
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            fileStoreRequest.isDone(),
            `/project/${this.projectId}/file/${file.id} should have been called`
          )
          assert(
            !createBlob.isDone(),
            `/api/projects/${historyId}/latest/files should not have been called`
          )
          assert(
            !addFile.isDone(),
            `/api/projects/${historyId}/latest/files should not have been called`
          )
          done()
        }
      )
    })

    it('should return a 500 if the filestore request errors', function (done) {
      const file = {
        id: ObjectId().toString(),
        pathname: '/test.png',
        contents: Buffer.from([1, 2, 3]),
        hash: 'aed2973e4b8a7ff1b30ff5c4751e5a2b38989e74',
      }

      const fileStoreRequest = MockFileStore()
        .get(`/project/${this.projectId}/file/${file.id}`)
        .replyWithError('oh no!')

      const createBlob = MockHistoryStore()
        .put(`/api/projects/${historyId}/blobs/${file.hash}`, file.contents)
        .reply(201)

      const addFile = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olAddFileUpdate(file, this.userId, this.timestamp, file.hash),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slAddFileUpdate(
                historyId,
                file,
                this.userId,
                this.timestamp,
                this.projectId
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(
              this.projectId,
              { allowErrors: true },
              (error, res) => {
                if (error) {
                  return cb(error)
                }
                expect(res.statusCode).to.equal(500)
                cb()
              }
            )
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            fileStoreRequest.isDone(),
            `/project/${this.projectId}/file/${file.id} should have been called`
          )
          assert(
            !createBlob.isDone(),
            `/api/projects/${historyId}/latest/files should not have been called`
          )
          assert(
            !addFile.isDone(),
            `/api/projects/${historyId}/latest/files should not have been called`
          )
          done()
        }
      )
    })
  })

  describe('with an existing projectVersion field', function () {
    beforeEach(function () {
      MockHistoryStore()
        .get(`/api/projects/${historyId}/latest/history`)
        .reply(200, {
          chunk: {
            startVersion: 0,
            history: {
              snapshot: { projectVersion: '100.0' },
              changes: [],
            },
          },
        })
    })

    it('should discard project structure updates which have already been applied', function (done) {
      const newDoc = []
      for (let i = 0; i <= 2; i++) {
        newDoc[i] = {
          id: ObjectId().toString(),
          pathname: `/main${i}.tex`,
          hash: '0a207c060e61f3b88eaee0a8cd0696f46fb155eb',
          docLines: 'a\nb',
        }
      }

      MockHistoryStore()
        .put(`/api/projects/${historyId}/blobs/${newDoc[0].hash}`)
        .times(3)
        .reply(201)

      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olAddDocUpdateWithVersion(
              newDoc[1],
              this.userId,
              this.timestamp,
              newDoc[1].hash,
              '101.0'
            ),
            olAddDocUpdateWithVersion(
              newDoc[2],
              this.userId,
              this.timestamp,
              newDoc[2].hash,
              '102.0'
            ),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slAddDocUpdateWithVersion(
                historyId,
                newDoc[0],
                this.userId,
                this.timestamp,
                newDoc[0].docLines,
                '100.0'
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slAddDocUpdateWithVersion(
                historyId,
                newDoc[1],
                this.userId,
                this.timestamp,
                newDoc[1].docLines,
                '101.0'
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slAddDocUpdateWithVersion(
                historyId,
                newDoc[2],
                this.userId,
                this.timestamp,
                newDoc[2].docLines,
                '102.0'
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createChange.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })
  })

  describe('with an existing docVersions field', function () {
    beforeEach(function () {
      MockHistoryStore()
        .get(`/api/projects/${historyId}/latest/history`)
        .reply(200, {
          chunk: {
            startVersion: 0,
            history: {
              snapshot: { v2DocVersions: { [this.doc.id]: { v: 100 } } }, // version 100 below already applied
              changes: [],
            },
          },
        })
    })

    it('should discard doc updates which have already been applied', function (done) {
      const createChange = MockHistoryStore()
        .post(`/api/projects/${historyId}/legacy_changes`, body => {
          expect(body).to.deep.equal([
            olTextUpdate(
              this.doc,
              this.userId,
              this.timestamp,
              [6, 'baz', 2],
              101
            ),
          ])
          return true
        })
        .query({ end_version: 0 })
        .reply(204)

      async.series(
        [
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(
                historyId,
                this.doc,
                this.userId,
                100,
                this.timestamp,
                [
                  { p: 3, i: 'foobar' }, // these ops should be skipped
                  { p: 6, d: 'bar' },
                ]
              ),
              cb
            )
            this.doc.length += 3
          },
          cb => {
            ProjectHistoryClient.pushRawUpdate(
              this.projectId,
              slTextUpdate(
                historyId,
                this.doc,
                this.userId,
                101,
                this.timestamp,
                [
                  { p: 6, i: 'baz' }, // this op should be applied
                ]
              ),
              cb
            )
          },
          cb => {
            ProjectHistoryClient.flushProject(this.projectId, cb)
          },
        ],
        error => {
          if (error) {
            return done(error)
          }
          assert(
            createChange.isDone(),
            `/api/projects/${historyId}/changes should have been called`
          )
          done()
        }
      )
    })
  })
})
