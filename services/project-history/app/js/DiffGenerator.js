/* eslint-disable
    no-proto,
    no-unused-vars,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

import logger from '@overleaf/logger'
import OError from '@overleaf/o-error'

export class ConsistencyError extends OError {}

/**
 * Container for functions that need to be mocked in tests
 *
 * TODO: Rewrite tests in terms of exported functions only
 */
export const _mocks = {}

export function buildDiff(initialContent, updates) {
  let diff = [{ u: initialContent }]
  for (const update of Array.from(updates)) {
    diff = applyUpdateToDiff(diff, update)
  }
  diff = compressDiff(diff)
  return diff
}

_mocks.compressDiff = diff => {
  const newDiff = []
  for (const part of Array.from(diff)) {
    const lastPart = newDiff[newDiff.length - 1]
    if (
      lastPart != null &&
      (lastPart.meta != null ? lastPart.meta.user : undefined) != null &&
      (part.meta != null ? part.meta.user : undefined) != null
    ) {
      if (
        lastPart.i != null &&
        part.i != null &&
        lastPart.meta.user.id === part.meta.user.id
      ) {
        lastPart.i += part.i
        lastPart.meta.start_ts = Math.min(
          lastPart.meta.start_ts,
          part.meta.start_ts
        )
        lastPart.meta.end_ts = Math.max(lastPart.meta.end_ts, part.meta.end_ts)
      } else if (
        lastPart.d != null &&
        part.d != null &&
        lastPart.meta.user.id === part.meta.user.id
      ) {
        lastPart.d += part.d
        lastPart.meta.start_ts = Math.min(
          lastPart.meta.start_ts,
          part.meta.start_ts
        )
        lastPart.meta.end_ts = Math.max(lastPart.meta.end_ts, part.meta.end_ts)
      } else {
        newDiff.push(part)
      }
    } else {
      newDiff.push(part)
    }
  }
  return newDiff
}

export function compressDiff(...args) {
  return _mocks.compressDiff(...args)
}

export function applyOpToDiff(diff, op, meta) {
  let consumedDiff
  const position = 0

  let remainingDiff = diff.slice()
  ;({ consumedDiff, remainingDiff } = _consumeToOffset(remainingDiff, op.p))
  const newDiff = consumedDiff

  if (op.i != null) {
    newDiff.push({
      i: op.i,
      meta,
    })
  } else if (op.d != null) {
    ;({ consumedDiff, remainingDiff } = _consumeDiffAffectedByDeleteOp(
      remainingDiff,
      op,
      meta
    ))
    newDiff.push(...Array.from(consumedDiff || []))
  }

  newDiff.push(...Array.from(remainingDiff || []))

  return newDiff
}

_mocks.applyUpdateToDiff = (diff, update) => {
  for (const op of Array.from(update.op)) {
    if (op.broken !== true) {
      diff = applyOpToDiff(diff, op, update.meta)
    }
  }
  return diff
}

export function applyUpdateToDiff(...args) {
  return _mocks.applyUpdateToDiff(...args)
}

function _consumeToOffset(remainingDiff, totalOffset) {
  let part
  const consumedDiff = []
  let position = 0
  while ((part = remainingDiff.shift())) {
    const length = _getLengthOfDiffPart(part)
    if (part.d != null) {
      consumedDiff.push(part)
    } else if (position + length >= totalOffset) {
      const partOffset = totalOffset - position
      if (partOffset > 0) {
        consumedDiff.push(_slicePart(part, 0, partOffset))
      }
      if (partOffset < length) {
        remainingDiff.unshift(_slicePart(part, partOffset))
      }
      break
    } else {
      position += length
      consumedDiff.push(part)
    }
  }

  return {
    consumedDiff,
    remainingDiff,
  }
}

function _consumeDiffAffectedByDeleteOp(remainingDiff, deleteOp, meta) {
  const consumedDiff = []
  let remainingOp = deleteOp
  while (remainingOp && remainingDiff.length > 0) {
    let newPart
    ;({ newPart, remainingDiff, remainingOp } = _consumeDeletedPart(
      remainingDiff,
      remainingOp,
      meta
    ))
    if (newPart != null) {
      consumedDiff.push(newPart)
    }
  }
  return {
    consumedDiff,
    remainingDiff,
  }
}

function _consumeDeletedPart(remainingDiff, op, meta) {
  let deletedContent, newPart, remainingOp
  const part = remainingDiff.shift()
  const partLength = _getLengthOfDiffPart(part)

  if (part.d != null) {
    // Skip existing deletes
    remainingOp = op
    newPart = part
  } else if (partLength > op.d.length) {
    // Only the first bit of the part has been deleted
    const remainingPart = _slicePart(part, op.d.length)
    remainingDiff.unshift(remainingPart)

    deletedContent = _getContentOfPart(part).slice(0, op.d.length)
    if (deletedContent !== op.d) {
      throw new ConsistencyError(
        `deleted content, '${deletedContent}', does not match delete op, '${op.d}'`
      )
    }

    if (part.u != null) {
      newPart = {
        d: op.d,
        meta,
      }
    } else if (part.i != null) {
      newPart = null
    }

    remainingOp = null
  } else if (partLength === op.d.length) {
    // The entire part has been deleted, but it is the last part

    deletedContent = _getContentOfPart(part)
    if (deletedContent !== op.d) {
      throw new ConsistencyError(
        `deleted content, '${deletedContent}', does not match delete op, '${op.d}'`
      )
    }

    if (part.u != null) {
      newPart = {
        d: op.d,
        meta,
      }
    } else if (part.i != null) {
      newPart = null
    }

    remainingOp = null
  } else if (partLength < op.d.length) {
    // The entire part has been deleted and there is more

    deletedContent = _getContentOfPart(part)
    const opContent = op.d.slice(0, deletedContent.length)
    if (deletedContent !== opContent) {
      throw new ConsistencyError(
        `deleted content, '${deletedContent}', does not match delete op, '${opContent}'`
      )
    }

    if (part.u) {
      newPart = {
        d: part.u,
        meta,
      }
    } else if (part.i != null) {
      newPart = null
    }

    remainingOp = {
      p: op.p,
      d: op.d.slice(_getLengthOfDiffPart(part)),
    }
  }

  return {
    newPart,
    remainingDiff,
    remainingOp,
  }
}

function _slicePart(basePart, from, to) {
  let part
  if (basePart.u != null) {
    part = { u: basePart.u.slice(from, to) }
  } else if (basePart.i != null) {
    part = { i: basePart.i.slice(from, to) }
  }
  if (basePart.meta != null) {
    part.meta = basePart.meta
  }
  return part
}

function _getLengthOfDiffPart(part) {
  return (part.u || part.d || part.i || '').length
}

function _getContentOfPart(part) {
  return part.u || part.d || part.i || ''
}
