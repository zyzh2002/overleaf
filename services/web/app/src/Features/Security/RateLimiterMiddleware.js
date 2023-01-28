const RateLimiter = require('../../infrastructure/RateLimiter')
const logger = require('@overleaf/logger')
const SessionManager = require('../Authentication/SessionManager')
const LoginRateLimiter = require('./LoginRateLimiter')
const settings = require('@overleaf/settings')

/*
  Do not allow more than opts.maxRequests from a single client in
  opts.timeInterval. Pass an array of opts.params to segment this based on
  parameters in the request URL, e.g.:

      app.get "/project/:project_id", RateLimiterMiddleware.rateLimit(endpointName: "open-editor", params: ["project_id"])

  will rate limit each project_id separately.

  Unique clients are identified by user_id if logged in, and IP address if not.
*/
function rateLimit(opts) {
  const getUserId =
    opts.getUserId || (req => SessionManager.getLoggedInUserId(req.session))
  return function (req, res, next) {
    const userId = getUserId(req) || req.ip
    if (
      settings.smokeTest &&
      settings.smokeTest.userId &&
      settings.smokeTest.userId.toString() === userId.toString()
    ) {
      // ignore smoke test user
      return next()
    }
    const params = (opts.params || []).map(p => req.params[p])
    params.push(userId)
    let subjectName = params.join(':')
    if (opts.ipOnly) {
      subjectName = req.ip
    }
    if (opts.endpointName == null) {
      throw new Error('no endpointName provided')
    }
    const options = {
      endpointName: opts.endpointName,
      timeInterval: opts.timeInterval || 60,
      subjectName,
      throttle: opts.maxRequests || 6,
    }
    return RateLimiter.addCount(options, function (error, canContinue) {
      if (error != null) {
        return next(error)
      }
      if (canContinue) {
        return next()
      } else {
        logger.warn(options, 'rate limit exceeded')
        res.status(429) // Too many requests
        res.write('Rate limit reached, please try again later')
        return res.end()
      }
    })
  }
}

function rateLimitV2(rateLimiter, opts = {}) {
  const getUserId =
    opts.getUserId || (req => SessionManager.getLoggedInUserId(req.session))
  return function (req, res, next) {
    const userId = getUserId(req) || req.ip
    if (
      settings.smokeTest &&
      settings.smokeTest.userId &&
      settings.smokeTest.userId.toString() === userId.toString()
    ) {
      // ignore smoke test user
      return next()
    }

    let key
    if (opts.ipOnly) {
      key = req.ip
    } else {
      const params = (opts.params || []).map(p => req.params[p])
      params.push(userId)
      key = params.join(':')
    }

    rateLimiter
      .consume(key)
      .then(() => next())
      .catch(err => {
        if (err instanceof Error) {
          next(err)
        } else {
          res.status(429) // Too many requests
          res.write('Rate limit reached, please try again later')
          res.end()
        }
      })
  }
}

function loginRateLimit(req, res, next) {
  const { email } = req.body
  if (!email) {
    return next()
  }
  LoginRateLimiter.processLoginRequest(email, function (err, isAllowed) {
    if (err) {
      return next(err)
    }
    if (isAllowed) {
      return next()
    } else {
      logger.warn({ email }, 'rate limit exceeded')
      res.status(429) // Too many requests
      res.write('Rate limit reached, please try again later')
      return res.end()
    }
  })
}

const RateLimiterMiddleware = {
  rateLimit,
  rateLimitV2,
  loginRateLimit,
}

module.exports = RateLimiterMiddleware
