import {
  checkChunkResponse,
  estimateSizeOfMultipartResponse,
  getMultipartBoundary,
  resolveMultiPartResponses,
} from '../pdf-preview/util/pdf-caching'
import getMeta from '../../utils/meta'
import OError from '@overleaf/o-error'
import { captureException } from '../../infrastructure/error-reporter'
import { postJSON } from '../../infrastructure/fetch-json'
import isSplitTestEnabled from '../../utils/isSplitTestEnabled'

const INITIAL_DELAY_MS = 30_000
const DELAY_BETWEEN_PROBES_MS = 1_000
const TIMEOUT_MS = 30_000
const FULL_SIZE = 739
const FULL_HASH =
  'b7d25591c18da373709d3d88ddf5eeab0b5089359e580f051314fd8935df0b73'
const CHUNKS = [
  {
    start: 0,
    end: 21,
    hash: 'd2ad9cbf1bc669646c0dfc43fa3167d30ab75077bb46bc9e3624b9e7e168abc2',
  },
  {
    start: 21,
    end: 42,
    hash: 'd6d110ec0f3f4e27a4050bc2be9c5552cc9092f86b74fec75072c2c9e8483454',
  },
  {
    start: 42,
    end: 64,
    hash: '8278914487a3a099c9af5aa22ed836d6587ca0beb7bf9a059fb0409667b3eb3d',
  },
]
async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function pickZone() {
  const x = Math.random()
  switch (true) {
    case x > 0.66:
      return 'b'
    case x > 0.33:
      return 'c'
    default:
      return 'd'
  }
}

function arrayLikeToHex(a: Uint8Array) {
  return Array.from(a)
    .map(i => i.toString(16).padStart(2, '0'))
    .join('')
}

async function hashBody(body: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', body)
  return arrayLikeToHex(new Uint8Array(digest))
}

async function checkHash(
  res: Response,
  data: ArrayBuffer,
  expectedHash: string
) {
  const actualHash = await hashBody(data)
  if (actualHash !== expectedHash) {
    throw new OError('content hash mismatch', {
      actualHash,
      expectedHash,
      headers: Object.fromEntries(res.headers.entries()),
    })
  }
}

function randomHex(bytes: number) {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return arrayLikeToHex(buf)
}

function genBuildId() {
  const date = Date.now().toString(16)
  const random = randomHex(8)
  return `${date}-${random}`
}

async function singleCheck(
  url: string,
  init: RequestInit,
  estimatedSize: number,
  expectedHash: string,
  chunks?: Array<any>
) {
  const ac = new AbortController()
  setTimeout(() => ac.abort(), TIMEOUT_MS)
  init.signal = ac.signal
  init.cache = 'no-store'

  const res = await fetch(url, init)
  checkChunkResponse(res, estimatedSize, init)

  const body = await res.arrayBuffer()
  if (chunks) {
    const boundary = getMultipartBoundary(res, chunks)
    const parts = resolveMultiPartResponses({
      file: { size: FULL_SIZE },
      chunks,
      data: new Uint8Array(body),
      boundary,
      metrics: {},
    })
    for (const part of parts) {
      await checkHash(res, part.data, part.chunk.hash)
    }
  } else {
    await checkHash(res, body, expectedHash)
  }
}

export async function checkUserContentDomainAccess() {
  // Note: The ids are zero prefixed. No actual user/project uses these ids.
  // mongo-id 000000000000000000000000 -> 1970-01-01T00:00:00.000Z
  // mongo-id 000000010000000000000000 -> 1970-01-01T00:00:01.000Z
  // mongo-id 100000000000000000000000 -> 1978-07-04T21:24:16.000Z
  // This allows us to distinguish between check-traffic and regular output
  //  traffic.
  const projectId = `0${randomHex(12).slice(1)}`
  const userId = `0${randomHex(12).slice(1)}`
  const buildId = genBuildId()
  const zone = pickZone()
  const urls = [
    `${getMeta(
      'ol-compilesUserContentDomain'
    )}/zone/${zone}/project/${projectId}/user/${userId}/build/${buildId}/output/output.pdf`,
    `${getMeta(
      'ol-compilesUserContentDomain'
    )}/zone/${zone}/project/${projectId}/build/${buildId}/output/output.pdf`,
  ]

  const cases = []
  for (const url of urls) {
    // full download
    cases.push({
      url,
      init: {},
      estimatedSize: FULL_SIZE,
      hash: FULL_HASH,
    })

    // range request
    const chunk = CHUNKS[0]
    cases.push({
      url,
      init: {
        headers: {
          Range: `bytes=${chunk.start}-${chunk.end - 1}`,
        },
      },
      estimatedSize: chunk.end - chunk.start,
      hash: chunk.hash,
    })

    // multipart request
    cases.push({
      url,
      init: {
        headers: {
          Range: `bytes=${CHUNKS.map(c => `${c.start}-${c.end - 1}`).join(
            ','
          )}`,
        },
      },
      estimatedSize: estimateSizeOfMultipartResponse(CHUNKS),
      hash: chunk.hash,
      chunks: CHUNKS,
    })
  }

  let failed = 0
  for (const { url, init, estimatedSize, hash, chunks } of cases) {
    await sleep(DELAY_BETWEEN_PROBES_MS)

    try {
      await singleCheck(url, init, estimatedSize, hash, chunks)
    } catch (err: any) {
      failed++
      OError.tag(err, 'user-content-domain-access-check failed', {
        url,
        init,
      })
      if (isSplitTestEnabled('report-user-content-domain-access-check-error')) {
        captureException(err)
      } else {
        console.error(OError.getFullStack(err), OError.getFullInfo(err))
      }
    }
  }

  try {
    await postJSON('/record-user-content-domain-access-check-result', {
      body: { failed, succeeded: cases.length - failed },
    })
  } catch (e) {}

  return failed === 0
}

let accessCheckPassed = false

export function userContentDomainAccessCheckPassed() {
  return accessCheckPassed
}

export function scheduleUserContentDomainAccessCheck() {
  sleep(INITIAL_DELAY_MS).then(() => {
    checkUserContentDomainAccess()
      .then(ok => {
        accessCheckPassed = ok
      })
      .catch(err => {
        captureException(err)
      })
  })
}
