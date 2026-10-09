export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const badRequest = (m, d) => new HttpError(400, m, d);
export const unauthorized = (m = 'Please sign in to continue') => new HttpError(401, m);
export const forbidden = (m = 'You do not have access to this') => new HttpError(403, m);
export const notFound = (m = 'Not found') => new HttpError(404, m);
export const conflict = (m) => new HttpError(409, m);

/** Parses `data` with a zod schema and throws a 400 with field messages. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = {};
    for (const issue of result.error.issues) details[issue.path.join('.') || '_'] = issue.message;
    throw badRequest(Object.values(details)[0] || 'Invalid request', details);
  }
  return result.data;
}

/** Wraps async route handlers so rejections reach the error middleware. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
