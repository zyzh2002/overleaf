import { expect } from 'chai'
import request from 'request'
import crypto from 'crypto'
import { ObjectId } from 'mongodb'
import nock from 'nock'
import * as ProjectHistoryClient from './helpers/ProjectHistoryClient.js'
import * as ProjectHistoryApp from './helpers/ProjectHistoryApp.js'

const MockHistoryStore = () => nock('http://localhost:3100')
const MockWeb = () => nock('http://localhost:3000')

function createMockBlob(historyId, content) {
  const sha = crypto.createHash('sha1').update(content).digest('hex')
  MockHistoryStore()
    .get(`/api/projects/${historyId}/blobs/${sha}`)
    .reply(200, content)
    .persist()
  return sha
}

describe('Diffs', function () {
  beforeEach(function (done) {
    ProjectHistoryApp.ensureRunning(error => {
      if (error) {
        throw error
      }

      this.historyId = ObjectId().toString()
      this.projectId = ObjectId().toString()

      MockHistoryStore().post('/api/projects').reply(200, {
        projectId: this.historyId,
      })
      MockWeb()
        .get(`/project/${this.projectId}/details`)
        .reply(200, {
          name: 'Test Project',
          overleaf: { history: { id: this.historyId } },
        })

      ProjectHistoryClient.initializeProject(this.historyId, error => {
        if (error) {
          return done(error)
        }
        done()
      })
    })
  })

  afterEach(function () {
    nock.cleanAll()
  })

  it('should return a diff of the updates to a doc from a single chunk', function (done) {
    this.blob = 'one two three five'
    this.sha = createMockBlob(this.historyId, this.blob)
    this.v2AuthorId = '123456789'
    MockHistoryStore()
      .get(`/api/projects/${this.historyId}/versions/6/history`)
      .reply(200, {
        chunk: {
          history: {
            snapshot: {
              files: {
                'foo.tex': {
                  hash: this.sha,
                  stringLength: this.blob.length,
                },
              },
            },
            changes: [
              {
                operations: [
                  {
                    pathname: 'foo.tex',
                    textOperation: [13, ' four', 5],
                  },
                ],
                timestamp: '2017-12-04T10:29:17.786Z',
                authors: [31],
              },
              {
                operations: [
                  {
                    pathname: 'foo.tex',
                    textOperation: [4, -4, 15],
                  },
                ],
                timestamp: '2017-12-04T10:29:22.905Z',
                authors: [31],
              },
              {
                operations: [
                  {
                    pathname: 'foo.tex',
                    textOperation: [19, ' six'],
                  },
                ],
                timestamp: '2017-12-04T10:29:26.120Z',
                v2Authors: [this.v2AuthorId],
              },
            ],
          },
          startVersion: 3,
        },
        authors: [31],
      })

    ProjectHistoryClient.getDiff(
      this.projectId,
      'foo.tex',
      3,
      6,
      (error, diff) => {
        if (error) {
          throw error
        }
        expect(diff).to.deep.equal({
          diff: [
            {
              u: 'one ',
            },
            {
              d: 'two ',
              meta: {
                users: [31],
                start_ts: 1512383362905,
                end_ts: 1512383362905,
              },
            },
            {
              u: 'three',
            },
            {
              i: ' four',
              meta: {
                users: [31],
                start_ts: 1512383357786,
                end_ts: 1512383357786,
              },
            },
            {
              u: ' five',
            },
            {
              i: ' six',
              meta: {
                users: [this.v2AuthorId],
                start_ts: 1512383366120,
                end_ts: 1512383366120,
              },
            },
          ],
        })
        done()
      }
    )
  })

  it('should return a diff of the updates to a doc across multiple chunks', function (done) {
    MockHistoryStore()
      .get(`/api/projects/${this.historyId}/versions/5/history`)
      .reply(200, {
        chunk: {
          history: {
            snapshot: {
              files: {
                'foo.tex': {
                  hash: createMockBlob(this.historyId, 'one two three five'),
                  stringLength: 'one three four five'.length,
                },
              },
            },
            changes: [
              {
                operations: [
                  {
                    pathname: 'foo.tex',
                    textOperation: [13, ' four', 5],
                  },
                ],
                timestamp: '2017-12-04T10:29:17.786Z',
                authors: [31],
              },
              {
                operations: [
                  {
                    pathname: 'foo.tex',
                    textOperation: [4, -4, 15],
                  },
                ],
                timestamp: '2017-12-04T10:29:22.905Z',
                authors: [31],
              },
            ],
          },
          startVersion: 3,
        },
        authors: [{ id: 31, email: 'james.allen@overleaf.com', name: 'James' }],
      })
    MockHistoryStore()
      .get(`/api/projects/${this.historyId}/versions/6/history`)
      .reply(200, {
        chunk: {
          history: {
            snapshot: {
              files: {
                'foo.tex': {
                  hash: createMockBlob(this.historyId, 'one three four five'),
                  stringLength: 'one three four five'.length,
                },
              },
            },
            changes: [
              {
                operations: [
                  {
                    pathname: 'foo.tex',
                    textOperation: [19, ' six'],
                  },
                ],
                timestamp: '2017-12-04T10:29:26.120Z',
                authors: [31],
              },
              {
                operations: [
                  {
                    pathname: 'foo.tex',
                    textOperation: [23, ' seven'],
                  },
                ],
                timestamp: '2017-12-04T10:29:26.120Z',
                authors: [31],
              },
            ],
          },
          startVersion: 5,
        },
        authors: [{ id: 31, email: 'james.allen@overleaf.com', name: 'James' }],
      })

    ProjectHistoryClient.getDiff(
      this.projectId,
      'foo.tex',
      4,
      6,
      (error, diff) => {
        if (error) {
          throw error
        }
        expect(diff).to.deep.equal({
          diff: [
            {
              u: 'one ',
            },
            {
              d: 'two ',
              meta: {
                users: [31],
                start_ts: 1512383362905,
                end_ts: 1512383362905,
              },
            },
            {
              u: 'three four five',
            },
            {
              i: ' six',
              meta: {
                users: [31],
                start_ts: 1512383366120,
                end_ts: 1512383366120,
              },
            },
          ],
        })
        done()
      }
    )
  })

  it('should return a 404 when there are no changes for the file in the range', function (done) {
    this.blob = 'one two three five'
    this.sha = createMockBlob(this.historyId, this.blob)
    MockHistoryStore()
      .get(`/api/projects/${this.historyId}/versions/6/history`)
      .reply(200, {
        chunk: {
          history: {
            snapshot: {
              files: {
                'foo.tex': {
                  hash: this.sha,
                  stringLength: this.blob.length,
                },
              },
            },
            changes: [
              {
                operations: [
                  {
                    pathname: 'foo.tex',
                    textOperation: [13, ' four', 5],
                  },
                ],
                timestamp: '2017-12-04T10:29:17.786Z',
                authors: [31],
              },
            ],
          },
          startVersion: 3,
        },
        authors: [31],
      })

    request.get(
      {
        url: `http://localhost:3054/project/${this.projectId}/diff`,
        qs: {
          pathname: 'not_here.tex',
          from: 3,
          to: 6,
        },
        json: true,
      },
      (error, res, body) => {
        if (error) {
          throw error
        }
        expect(res.statusCode).to.equal(404)
        done()
      }
    )
  })

  it('should return a binary flag with a diff of a binary file', function (done) {
    this.blob = 'one two three five'
    this.sha = createMockBlob(this.historyId, this.blob)
    this.binaryBlob = Buffer.from([1, 2, 3, 4])
    this.binarySha = createMockBlob(this.historyId, this.binaryBlob)
    MockHistoryStore()
      .get(`/api/projects/${this.historyId}/versions/6/history`)
      .reply(200, {
        chunk: {
          history: {
            snapshot: {
              files: {
                'binary.tex': {
                  hash: this.binarySha,
                  byteLength: this.binaryBlob.length, // Indicates binary
                },
                'foo.tex': {
                  hash: this.sha,
                  stringLength: this.blob.length, // Indicates binary
                },
              },
            },
            changes: [
              {
                operations: [
                  {
                    pathname: 'foo.tex',
                    textOperation: [13, ' four', 5],
                  },
                ],
                timestamp: '2017-12-04T10:29:17.786Z',
                authors: [31],
              },
              {
                operations: [
                  {
                    pathname: 'foo.tex',
                    textOperation: [4, -4, 15],
                  },
                ],
                timestamp: '2017-12-04T10:29:22.905Z',
                authors: [31],
              },
              {
                operations: [
                  {
                    pathname: 'foo.tex',
                    textOperation: [19, ' six'],
                  },
                ],
                timestamp: '2017-12-04T10:29:26.120Z',
                authors: [31],
              },
            ],
          },
          startVersion: 3,
        },
        authors: [{ id: 31, email: 'james.allen@overleaf.com', name: 'James' }],
      })

    ProjectHistoryClient.getDiff(
      this.projectId,
      'binary.tex',
      3,
      6,
      (error, diff) => {
        if (error) {
          throw error
        }
        expect(diff).to.deep.equal({
          diff: {
            binary: true,
          },
        })
        done()
      }
    )
  })
})
