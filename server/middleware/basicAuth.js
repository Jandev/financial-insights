/**
 * Basic Auth middleware — placeholder for issue #14.
 *
 * When BASIC_AUTH_USER and BASIC_AUTH_PASS are both set in the environment
 * this will reject unauthenticated requests with 401.
 * Currently passes all requests through until #14 is implemented.
 */

/**
 * @param {import('express').Request}  _req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
function basicAuth(_req, _res, next) {
  // TODO(#14): implement HTTP Basic Auth when env vars are set
  next()
}

export default basicAuth
