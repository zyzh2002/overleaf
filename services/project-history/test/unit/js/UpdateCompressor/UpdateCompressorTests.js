import { expect } from 'chai'
import { strict as esmock } from 'esmock'

const MODULE_PATH = '../../../../app/js/UpdateCompressor.js'

const bigstring = 'a'.repeat(2 * 1024 * 1024)
const mediumstring = 'a'.repeat(1024 * 1024)

describe('UpdateCompressor', function () {
  beforeEach(async function () {
    this.UpdateCompressor = await esmock(MODULE_PATH)
    this.user_id = 'user-id-1'
    this.other_user_id = 'user-id-2'
    this.doc_id = 'mock-doc-id'
    this.ts1 = Date.now()
    this.ts2 = Date.now() + 1000
  })

  describe('convertToSingleOpUpdates', function () {
    it('should split grouped updates into individual updates', function () {
      expect(
        this.UpdateCompressor.convertToSingleOpUpdates([
          {
            op: [
              (this.op1 = { p: 0, i: 'Foo' }),
              (this.op2 = { p: 6, i: 'bar' }),
            ],
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            op: [(this.op3 = { p: 10, i: 'baz' })],
            meta: { ts: this.ts2, user_id: this.other_user_id },
            v: 43,
          },
        ])
      ).to.deep.equal([
        {
          op: this.op1,
          meta: { ts: this.ts1, user_id: this.user_id },
          v: 42,
        },
        {
          op: this.op2,
          meta: { ts: this.ts1, user_id: this.user_id },
          v: 42,
        },
        {
          op: this.op3,
          meta: { ts: this.ts2, user_id: this.other_user_id },
          v: 43,
        },
      ])
    })

    it('should return no-op updates when the op list is empty', function () {
      expect(
        this.UpdateCompressor.convertToSingleOpUpdates([
          {
            op: [],
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
        ])
      ).to.deep.equal([])
    })

    it('should ignore comment ops', function () {
      expect(
        this.UpdateCompressor.convertToSingleOpUpdates([
          {
            op: [
              (this.op1 = { p: 0, i: 'Foo' }),
              (this.op2 = { p: 9, c: 'baz' }),
              (this.op3 = { p: 6, i: 'bar' }),
            ],
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
        ])
      ).to.deep.equal([
        {
          op: this.op1,
          meta: { ts: this.ts1, user_id: this.user_id },
          v: 42,
        },
        {
          op: this.op3,
          meta: { ts: this.ts1, user_id: this.user_id },
          v: 42,
        },
      ])
    })

    it('should update doc_length when splitting after an insert', function () {
      expect(
        this.UpdateCompressor.convertToSingleOpUpdates([
          {
            op: [
              (this.op1 = { p: 0, i: 'foo' }),
              (this.op2 = { p: 6, d: 'bar' }),
            ],
            meta: { ts: this.ts1, user_id: this.user_id, doc_length: 20 },
            v: 42,
          },
        ])
      ).to.deep.equal([
        {
          op: this.op1,
          meta: { ts: this.ts1, user_id: this.user_id, doc_length: 20 },
          v: 42,
        },
        {
          op: this.op2,
          meta: { ts: this.ts1, user_id: this.user_id, doc_length: 23 },
          v: 42,
        },
      ])
    })

    it('should update doc_length when splitting after a delete', function () {
      expect(
        this.UpdateCompressor.convertToSingleOpUpdates([
          {
            op: [
              (this.op1 = { p: 0, d: 'foo' }),
              (this.op2 = { p: 6, i: 'bar' }),
            ],
            meta: { ts: this.ts1, user_id: this.user_id, doc_length: 20 },
            v: 42,
          },
        ])
      ).to.deep.equal([
        {
          op: this.op1,
          meta: { ts: this.ts1, user_id: this.user_id, doc_length: 20 },
          v: 42,
        },
        {
          op: this.op2,
          meta: { ts: this.ts1, user_id: this.user_id, doc_length: 17 },
          v: 42,
        },
      ])
    })
  })

  describe('concatUpdatesWithSameVersion', function () {
    it('should concat updates with the same version, doc and pathname', function () {
      expect(
        this.UpdateCompressor.concatUpdatesWithSameVersion([
          {
            doc: this.doc_id,
            pathname: 'main.tex',
            op: (this.op1 = { p: 0, i: 'Foo' }),
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            doc: this.doc_id,
            pathname: 'main.tex',
            op: (this.op2 = { p: 6, i: 'bar' }),
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            doc: this.doc_id,
            pathname: 'main.tex',
            op: (this.op3 = { p: 10, i: 'baz' }),
            meta: { ts: this.ts2, user_id: this.other_user_id },
            v: 43,
          },
        ])
      ).to.deep.equal([
        {
          doc: this.doc_id,
          pathname: 'main.tex',
          op: [this.op1, this.op2],
          meta: { ts: this.ts1, user_id: this.user_id },
          v: 42,
        },
        {
          doc: this.doc_id,
          pathname: 'main.tex',
          op: [this.op3],
          meta: { ts: this.ts2, user_id: this.other_user_id },
          v: 43,
        },
      ])
    })

    it('should not concat updates with different doc id', function () {
      expect(
        this.UpdateCompressor.concatUpdatesWithSameVersion([
          {
            doc: this.doc_id,
            pathname: 'main.tex',
            op: (this.op1 = { p: 0, i: 'Foo' }),
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            doc: 'other',
            pathname: 'main.tex',
            op: (this.op2 = { p: 6, i: 'bar' }),
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            doc: this.doc_id,
            pathname: 'main.tex',
            op: (this.op3 = { p: 10, i: 'baz' }),
            meta: { ts: this.ts2, user_id: this.other_user_id },
            v: 43,
          },
        ])
      ).to.deep.equal([
        {
          doc: this.doc_id,
          pathname: 'main.tex',
          op: [this.op1],
          meta: { ts: this.ts1, user_id: this.user_id },
          v: 42,
        },
        {
          doc: 'other',
          pathname: 'main.tex',
          op: [this.op2],
          meta: { ts: this.ts1, user_id: this.user_id },
          v: 42,
        },
        {
          doc: this.doc_id,
          pathname: 'main.tex',
          op: [this.op3],
          meta: { ts: this.ts2, user_id: this.other_user_id },
          v: 43,
        },
      ])
    })

    it('should not concat text updates with project structure ops', function () {
      expect(
        this.UpdateCompressor.concatUpdatesWithSameVersion([
          {
            doc: this.doc_id,
            pathname: 'main.tex',
            op: (this.op1 = { p: 0, i: 'Foo' }),
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            pathname: 'main.tex',
            new_pathname: 'new.tex',
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
        ])
      ).to.deep.equal([
        {
          doc: this.doc_id,
          pathname: 'main.tex',
          op: [this.op1],
          meta: { ts: this.ts1, user_id: this.user_id },
          v: 42,
        },
        {
          pathname: 'main.tex',
          new_pathname: 'new.tex',
          meta: { ts: this.ts1, user_id: this.user_id },
          v: 42,
        },
      ])
    })
  })

  describe('compress', function () {
    describe('insert - insert', function () {
      it('should append one insert to the other', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, i: 'foo' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 6, i: 'bar' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, i: 'foobar' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 43,
          },
        ])
      })

      it('should insert one insert inside the other', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, i: 'foo' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 5, i: 'bar' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, i: 'fobaro' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 43,
          },
        ])
      })

      it('should not append separated inserts', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, i: 'foo' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 9, i: 'bar' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, i: 'foo' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            op: { p: 9, i: 'bar' },
            meta: { ts: this.ts2, user_id: this.user_id },
            v: 43,
          },
        ])
      })

      it('should not append inserts that are too big (second op)', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, i: 'foo' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 6, i: bigstring },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, i: 'foo' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            op: { p: 6, i: bigstring },
            meta: { ts: this.ts2, user_id: this.user_id },
            v: 43,
          },
        ])
      })

      it('should not append inserts that are too big (first op)', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, i: bigstring },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 3 + bigstring.length, i: 'bar' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, i: bigstring },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            op: { p: 3 + bigstring.length, i: 'bar' },
            meta: { ts: this.ts2, user_id: this.user_id },
            v: 43,
          },
        ])
      })

      it('should not append inserts that are too big (first and second op)', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, i: mediumstring },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 3 + mediumstring.length, i: mediumstring },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, i: mediumstring },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            op: { p: 3 + mediumstring.length, i: mediumstring },
            meta: { ts: this.ts2, user_id: this.user_id },
            v: 43,
          },
        ])
      })

      it('should not append inserts that are a long time appart', function () {
        this.ts3 = this.ts1 + 120000 // 2 minutes
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, i: 'foo' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 6, i: 'bar' },
              meta: { ts: this.ts3, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, i: 'foo' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            op: { p: 6, i: 'bar' },
            meta: { ts: this.ts3, user_id: this.user_id },
            v: 43,
          },
        ])
      })

      it('should not append inserts separated by project structure ops', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, i: 'foo' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              pathname: '/old.tex',
              new_pathname: '/new.tex',
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 43,
            },
            {
              op: { p: 6, i: 'bar' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 44,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, i: 'foo' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            pathname: '/old.tex',
            new_pathname: '/new.tex',
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 43,
          },
          {
            op: { p: 6, i: 'bar' },
            meta: { ts: this.ts2, user_id: this.user_id },
            v: 44,
          },
        ])
      })

      it('should not append ops from different doc ids', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              doc: 'doc-one',
              op: { p: 3, i: 'foo' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              doc: 'doc-two',
              op: { p: 6, i: 'bar' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            doc: 'doc-one',
            op: { p: 3, i: 'foo' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            doc: 'doc-two',
            op: { p: 6, i: 'bar' },
            meta: { ts: this.ts2, user_id: this.user_id },
            v: 43,
          },
        ])
      })

      it('should not append ops from different doc pathnames', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              pathname: 'doc-one',
              op: { p: 3, i: 'foo' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              pathname: 'doc-two',
              op: { p: 6, i: 'bar' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            pathname: 'doc-one',
            op: { p: 3, i: 'foo' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            pathname: 'doc-two',
            op: { p: 6, i: 'bar' },
            meta: { ts: this.ts2, user_id: this.user_id },
            v: 43,
          },
        ])
      })
    })

    describe('delete - delete', function () {
      it('should append one delete to the other', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, d: 'foo' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 3, d: 'bar' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, d: 'foobar' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 43,
          },
        ])
      })

      it('should insert one delete inside the other', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, d: 'foo' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 1, d: 'bar' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 1, d: 'bafoor' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 43,
          },
        ])
      })

      it('should not append separated deletes', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, d: 'foo' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 9, d: 'bar' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, d: 'foo' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            op: { p: 9, d: 'bar' },
            meta: { ts: this.ts2, user_id: this.user_id },
            v: 43,
          },
        ])
      })
    })

    describe('insert - delete', function () {
      it('should undo a previous insert', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, i: 'foo' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 5, d: 'o' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, i: 'fo' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 43,
          },
        ])
      })

      it('should remove part of an insert from the middle', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, i: 'fobaro' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 5, d: 'bar' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, i: 'foo' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 43,
          },
        ])
      })

      it('should cancel out two opposite updates', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, i: 'foo' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 3, d: 'foo' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([])
      })

      it('should not combine separated updates', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, i: 'foo' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 9, d: 'bar' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, i: 'foo' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            op: { p: 9, d: 'bar' },
            meta: { ts: this.ts2, user_id: this.user_id },
            v: 43,
          },
        ])
      })

      it('should not combine updates with overlap beyond the end', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, i: 'foobar' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 6, d: 'bardle' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, i: 'foobar' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 42,
          },
          {
            op: { p: 6, d: 'bardle' },
            meta: { ts: this.ts2, user_id: this.user_id },
            v: 43,
          },
        ])
      })
    })

    describe('delete - insert', function () {
      it('should do a diff of the content', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, d: 'one two three four five six seven eight' },
              meta: { ts: this.ts1, user_id: this.user_id, doc_length: 100 },
              v: 42,
            },
            {
              op: { p: 3, i: 'one 2 three four five six seven eight' },
              meta: { ts: this.ts2, user_id: this.user_id, doc_length: 100 },
              v: 43,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 7, d: 'two' },
            meta: { ts: this.ts1, user_id: this.user_id, doc_length: 100 },
            v: 43,
          },
          {
            op: { p: 7, i: '2' },
            meta: { ts: this.ts1, user_id: this.user_id, doc_length: 97 },
            v: 43,
          },
        ])
      })

      it('should return a no-op if the delete and insert are the same', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, d: 'one two three four five six seven eight' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 3, i: 'one two three four five six seven eight' },
              meta: { ts: this.ts2, user_id: this.user_id },
              v: 43,
            },
          ])
        ).to.deep.equal([])
      })
    })

    describe('a long chain of ops', function () {
      it('should always split after 60 seconds', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, i: 'foo' },
              meta: { ts: this.ts1, user_id: this.user_id },
              v: 42,
            },
            {
              op: { p: 6, i: 'bar' },
              meta: { ts: this.ts1 + 20000, user_id: this.user_id },
              v: 43,
            },
            {
              op: { p: 9, i: 'baz' },
              meta: { ts: this.ts1 + 40000, user_id: this.user_id },
              v: 44,
            },
            {
              op: { p: 12, i: 'qux' },
              meta: { ts: this.ts1 + 80000, user_id: this.user_id },
              v: 45,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, i: 'foobarbaz' },
            meta: { ts: this.ts1, user_id: this.user_id },
            v: 44,
          },
          {
            op: { p: 12, i: 'qux' },
            meta: { ts: this.ts1 + 80000, user_id: this.user_id },
            v: 45,
          },
        ])
      })
    })

    describe('external updates', function () {
      it('should be split from editor updates and from other sources', function () {
        expect(
          this.UpdateCompressor.compressUpdates([
            {
              op: { p: 3, i: 'foo' },
              meta: {
                ts: this.ts1,
                user_id: this.user_id,
                source: 'some-editor-id',
              },
              v: 42,
            },
            {
              op: { p: 6, i: 'bar' },
              meta: {
                ts: this.ts1,
                user_id: this.user_id,
                source: 'some-other-editor-id',
              },
              v: 43,
            },
            {
              op: { p: 9, i: 'baz' },
              meta: {
                ts: this.ts1,
                user_id: this.user_id,
                type: 'external',
                source: 'dropbox',
              },
              v: 44,
            },
            {
              op: { p: 12, i: 'qux' },
              meta: {
                ts: this.ts1,
                user_id: this.user_id,
                type: 'external',
                source: 'dropbox',
              },
              v: 45,
            },
            {
              op: { p: 15, i: 'quux' },
              meta: {
                ts: this.ts1,
                user_id: this.user_id,
                type: 'external',
                source: 'upload',
              },
              v: 46,
            },
          ])
        ).to.deep.equal([
          {
            op: { p: 3, i: 'foobar' },
            meta: {
              ts: this.ts1,
              user_id: this.user_id,
              source: 'some-editor-id',
            },
            v: 43,
          },
          {
            op: { p: 9, i: 'bazqux' },
            meta: {
              ts: this.ts1,
              user_id: this.user_id,
              type: 'external',
              source: 'dropbox',
            },
            v: 45,
          },
          {
            op: { p: 15, i: 'quux' },
            meta: {
              ts: this.ts1,
              user_id: this.user_id,
              type: 'external',
              source: 'upload',
            },
            v: 46,
          },
        ])
      })
    })
  })
})
