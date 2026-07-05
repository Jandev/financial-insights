import type { Request, Response, NextFunction } from 'express'

/**
 * HTTP Basic Auth middleware stub.
 * TODO(#14): implement when BASIC_AUTH_USER and BASIC_AUTH_PASS are set.
 */
export default function basicAuth(_req: Request, _res: Response, next: NextFunction): void {
  next()
}
