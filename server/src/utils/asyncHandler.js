'use strict';

/** Express 4 does not catch rejected promises – this wrapper forwards them to the error handler. */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/** Wraps every handler of a controller object. */
function wrapController(controller) {
  const wrapped = {};
  for (const [key, value] of Object.entries(controller)) {
    wrapped[key] = typeof value === 'function' ? asyncHandler(value) : value;
  }
  return wrapped;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

module.exports = { asyncHandler, wrapController, HttpError };
