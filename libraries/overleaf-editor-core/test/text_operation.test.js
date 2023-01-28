//
// These tests are based on the OT.js tests:
// https://github.com/Operational-Transformation/ot.js/blob/
//   8873b7e28e83f9adbf6c3a28ec639c9151a838ae/test/lib/test-text-operation.js
//
'use strict'

const { expect } = require('chai')
const random = require('./support/random')

const ot = require('..')
const TextOperation = ot.TextOperation

function randomOperation(str) {
  const operation = new TextOperation()
  let left
  while (true) {
    left = str.length - operation.baseLength
    if (left === 0) break
    const r = Math.random()
    const l = 1 + random.int(Math.min(left - 1, 20))
    if (r < 0.2) {
      operation.insert(random.string(l))
    } else if (r < 0.4) {
      operation.remove(l)
    } else {
      operation.retain(l)
    }
  }
  if (Math.random() < 0.3) {
    operation.insert(1 + random.string(10))
  }
  return operation
}

describe('TextOperation', function () {
  const numTrials = 500

  it('tracks base and target lengths', function () {
    const o = new TextOperation()
    expect(o.baseLength).to.equal(0)
    expect(o.targetLength).to.equal(0)
    o.retain(5)
    expect(o.baseLength).to.equal(5)
    expect(o.targetLength).to.equal(5)
    o.insert('abc')
    expect(o.baseLength).to.equal(5)
    expect(o.targetLength).to.equal(8)
    o.retain(2)
    expect(o.baseLength).to.equal(7)
    expect(o.targetLength).to.equal(10)
    o.remove(2)
    expect(o.baseLength).to.equal(9)
    expect(o.targetLength).to.equal(10)
  })

  it('supports chaining', function () {
    const o = new TextOperation()
      .retain(5)
      .retain(0)
      .insert('lorem')
      .insert('')
      .remove('abc')
      .remove(3)
      .remove(0)
      .remove('')
    expect(o.ops.length).to.equal(3)
  })

  it('ignores empty operations', function () {
    const o = new TextOperation()
    o.retain(0)
    o.insert('')
    o.remove('')
    expect(o.ops.length).to.equal(0)
  })

  it('checks for equality', function () {
    const op1 = new TextOperation().remove(1).insert('lo').retain(2).retain(3)
    const op2 = new TextOperation().remove(-1).insert('l').insert('o').retain(5)
    expect(op1.equals(op2)).to.be.true
    op1.remove(1)
    op2.retain(1)
    expect(op1.equals(op2)).to.be.false
  })

  it('merges ops', function () {
    function last(arr) {
      return arr[arr.length - 1]
    }
    const o = new TextOperation()
    expect(o.ops.length).to.equal(0)
    o.retain(2)
    expect(o.ops.length).to.equal(1)
    expect(last(o.ops)).to.equal(2)
    o.retain(3)
    expect(o.ops.length).to.equal(1)
    expect(last(o.ops)).to.equal(5)
    o.insert('abc')
    expect(o.ops.length).to.equal(2)
    expect(last(o.ops)).to.equal('abc')
    o.insert('xyz')
    expect(o.ops.length).to.equal(2)
    expect(last(o.ops)).to.equal('abcxyz')
    o.remove('d')
    expect(o.ops.length).to.equal(3)
    expect(last(o.ops)).to.equal(-1)
    o.remove('d')
    expect(o.ops.length).to.equal(3)
    expect(last(o.ops)).to.equal(-2)
  })

  it('checks for no-ops', function () {
    const o = new TextOperation()
    expect(o.isNoop()).to.be.true
    o.retain(5)
    expect(o.isNoop()).to.be.true
    o.retain(3)
    expect(o.isNoop()).to.be.true
    o.insert('lorem')
    expect(o.isNoop()).to.be.false
  })

  it('converts to string', function () {
    const o = new TextOperation()
    o.retain(2)
    o.insert('lorem')
    o.remove('ipsum')
    o.retain(5)
    expect(o.toString()).to.equal(
      "retain 2, insert 'lorem', remove 5, retain 5"
    )
  })

  it('converts from JSON', function () {
    const ops = [2, -1, -1, 'cde']
    const o = TextOperation.fromJSON(ops)
    expect(o.ops.length).to.equal(3)
    expect(o.baseLength).to.equal(4)
    expect(o.targetLength).to.equal(5)

    function assertIncorrectAfter(fn) {
      const ops2 = ops.slice(0)
      fn(ops2)
      expect(() => {
        TextOperation.fromJSON(ops2)
      }).to.throw
    }

    assertIncorrectAfter(ops2 => {
      ops2.push({ insert: 'x' })
    })
    assertIncorrectAfter(ops2 => {
      ops2.push(null)
    })
  })

  it(
    'applies (randomised)',
    random.test(numTrials, () => {
      const str = random.string(50)
      const o = randomOperation(str)
      expect(str.length).to.equal(o.baseLength)
      expect(o.apply(str).length).to.equal(o.targetLength)
    })
  )

  it(
    'inverts (randomised)',
    random.test(numTrials, () => {
      const str = random.string(50)
      const o = randomOperation(str)
      const p = o.invert(str)
      expect(o.baseLength).to.equal(p.targetLength)
      expect(o.targetLength).to.equal(p.baseLength)
      expect(p.apply(o.apply(str))).to.equal(str)
    })
  )

  it(
    'converts to/from JSON (randomised)',
    random.test(numTrials, () => {
      const doc = random.string(50)
      const operation = randomOperation(doc)
      const roundTripOperation = TextOperation.fromJSON(operation.toJSON())
      expect(operation.equals(roundTripOperation)).to.be.true
    })
  )

  it(
    'composes (randomised)',
    random.test(numTrials, () => {
      // invariant: apply(str, compose(a, b)) === apply(apply(str, a), b)
      const str = random.string(20)
      const a = randomOperation(str)
      const afterA = a.apply(str)
      expect(afterA.length).to.equal(a.targetLength)
      const b = randomOperation(afterA)
      const afterB = b.apply(afterA)
      expect(afterB.length).to.equal(b.targetLength)
      const ab = a.compose(b)
      expect(ab.targetLength).to.equal(b.targetLength)
      const afterAB = ab.apply(str)
      expect(afterAB).to.equal(afterB)
    })
  )

  it(
    'transforms (randomised)',
    random.test(numTrials, () => {
      // invariant: compose(a, b') = compose(b, a')
      // where (a', b') = transform(a, b)
      const str = random.string(20)
      const a = randomOperation(str)
      const b = randomOperation(str)
      const primes = TextOperation.transform(a, b)
      const aPrime = primes[0]
      const bPrime = primes[1]
      const abPrime = a.compose(bPrime)
      const baPrime = b.compose(aPrime)
      const afterAbPrime = abPrime.apply(str)
      const afterBaPrime = baPrime.apply(str)
      expect(abPrime.equals(baPrime)).to.be.true
      expect(afterAbPrime).to.equal(afterBaPrime)
    })
  )

  it('throws when invalid operations are applied', function () {
    const operation = new TextOperation().retain(1)
    expect(() => {
      operation.apply('')
    }).to.throw(TextOperation.ApplyError)
    expect(() => {
      operation.apply(' ')
    }).not.to.throw
  })

  it('throws when insert text contains non BMP chars', function () {
    const operation = new TextOperation()
    const str = '𝌆\n'
    expect(() => {
      operation.insert(str)
    }).to.throw(
      TextOperation.UnprocessableError,
      /inserted text contains non BMP characters/
    )
  })

  it('throws when base string contains non BMP chars', function () {
    const operation = new TextOperation()
    const str = '𝌆\n'
    expect(() => {
      operation.apply(str)
    }).to.throw(
      TextOperation.UnprocessableError,
      /string contains non BMP characters/
    )
  })

  it('throws at from JSON when it contains non BMP chars', function () {
    const operation = ['𝌆\n']
    expect(() => {
      TextOperation.fromJSON(operation)
    }).to.throw(
      TextOperation.UnprocessableError,
      /inserted text contains non BMP characters/
    )
  })
})
