/* eslint-disable
    camelcase,
    n/handle-callback-err,
    max-len,
    no-return-assign,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const { assert } = require('chai')
const async = require('async')
const User = require('./helpers/User')
const request = require('./helpers/request')

const assert_has_common_headers = function (response) {
  const { headers } = response
  assert.include(headers, {
    'x-download-options': 'noopen',
    'x-xss-protection': '0',
    'cross-origin-resource-policy': 'same-origin',
    'cross-origin-opener-policy': 'same-origin-allow-popups',
    'x-content-type-options': 'nosniff',
    'x-permitted-cross-domain-policies': 'none',
    'referrer-policy': 'origin-when-cross-origin',
  })
  assert.isUndefined(headers['cross-origin-embedder-policy'])
}

const assert_has_cache_headers = function (response) {
  assert.include(response.headers, {
    'surrogate-control': 'no-store',
    'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    pragma: 'no-cache',
    expires: '0',
  })
}

const assert_has_no_cache_headers = function (response) {
  assert.doesNotHaveAnyKeys(response.headers, [
    'surrogate-control',
    'cache-control',
    'pragma',
    'expires',
  ])
}

const assert_has_asset_caching_headers = function (response) {
  assert.equal(response.headers['cache-control'], 'public, max-age=31536000')
}

describe('SecurityHeaders', function () {
  beforeEach(function () {
    return (this.user = new User())
  })

  it('should not have x-powered-by header', function (done) {
    return request.get('/', (err, res, body) => {
      assert.isUndefined(res.headers['x-powered-by'])
      return done()
    })
  })

  it('should have all common headers', function (done) {
    return request.get('/', (err, res, body) => {
      assert_has_common_headers(res)
      return done()
    })
  })

  it('should not have cache headers on public pages', function (done) {
    return request.get('/', (err, res, body) => {
      assert_has_no_cache_headers(res)
      return done()
    })
  })

  it('should have caching headers on static assets', function (done) {
    request.get('/favicon.ico', (err, res) => {
      assert_has_asset_caching_headers(res)
      done(err)
    })
  })

  it('should have cache headers when user is logged in', function (done) {
    return async.series(
      [
        cb => this.user.login(cb),
        cb => this.user.request.get('/', cb),
        cb => this.user.logout(cb),
      ],
      (err, results) => {
        const main_response = results[1][0]
        assert_has_cache_headers(main_response)
        return done()
      }
    )
  })

  it('should have cache headers on project page', function (done) {
    return async.series(
      [
        cb => this.user.login(cb),
        cb => {
          return this.user.createProject(
            'public-project',
            (error, project_id) => {
              if (error != null) {
                return done(error)
              }
              this.project_id = project_id
              return this.user.makePublic(this.project_id, 'readAndWrite', cb)
            }
          )
        },
        cb => this.user.logout(cb),
      ],
      (err, results) => {
        return request.get(`/project/${this.project_id}`, (err, res, body) => {
          assert_has_cache_headers(res)
          return done()
        })
      }
    )
  })

  it('should have caching headers on static assets when user is logged in', function (done) {
    async.series(
      [
        cb => this.user.login(cb),
        cb => this.user.request.get('/favicon.ico', cb),
        cb => this.user.logout(cb),
      ],
      (err, results) => {
        const res = results[1][0]
        assert_has_asset_caching_headers(res)
        done()
      }
    )
  })
})
