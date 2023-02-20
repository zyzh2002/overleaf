import { isNetworkError } from '../../../utils/isNetworkError'
import getMeta from '../../../utils/meta'
import OError from '@overleaf/o-error'
import { postJSON } from '../../../infrastructure/fetch-json'

let useFallbackDomainUntil = performance.now()
const ONE_HOUR_IN_MS = 1000 * 60 * 60

class MaybeBlockedByProxyError extends OError {}

function checkForBlockingByProxy(res: Response) {
  const statusCode = res.status
  switch (statusCode) {
    case 200: // full response
    case 206: // range response
    case 404: // file not found
    case 416: // range not found
      return
    default:
      throw new MaybeBlockedByProxyError('request might be blocked by proxy', {
        res,
        statusCode,
      })
  }
}

export async function fetchFromCompileDomain(url: string, init: RequestInit) {
  const userContentDomain = getMeta('ol-compilesUserContentDomain')
  let isUserContentDomain =
    userContentDomain &&
    new URL(url).hostname === new URL(userContentDomain).hostname

  if (useFallbackDomainUntil > performance.now()) {
    isUserContentDomain = false
    url = withFallbackCompileDomain(url)
  }
  try {
    const res = await fetch(url, init)
    if (isUserContentDomain) {
      // Only throw a MaybeBlockedByProxyError when the request will be retried
      //  on the fallback domain below.
      checkForBlockingByProxy(res)
    }
    return res
  } catch (err) {
    if (
      (isNetworkError(err) || err instanceof MaybeBlockedByProxyError) &&
      isUserContentDomain
    ) {
      try {
        const res = await fetch(withFallbackCompileDomain(url), init)
        // Only switch to the fallback when fetch does not throw there as well.
        if (useFallbackDomainUntil < performance.now()) {
          useFallbackDomainUntil = performance.now() + ONE_HOUR_IN_MS
          recordFallbackUsage()
        }
        return res
      } catch (err2: any) {
        throw OError.tag(err2, 'fallback request failed', {
          errUserContentDomain: err,
        })
      }
    }
    throw err
  }
}

export function swapDomain(url: string, domain: string) {
  const u = new URL(url)
  u.hostname = new URL(domain).hostname
  return u.href
}

function withFallbackCompileDomain(url: string) {
  return swapDomain(url, getMeta('ol-fallbackCompileDomain'))
}

function recordFallbackUsage() {
  setTimeout(() => {
    postJSON('/record-user-content-domain-fallback-usage').catch(() => {})
  }, 1_000)
}
