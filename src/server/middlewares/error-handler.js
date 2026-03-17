'use strict';

const { PublicError } = require('../errors/public-error');

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  console.error('Unhandled request error', {
    method: req.method,
    path: req.originalUrl || req.url,
    error: err,
  });

  if (err instanceof PublicError) {
    return res.status(err.statusCode).json({
      status: 'error',
      code: err.code,
      message: err.publicMessage,
    });
  }

  return res.status(500).json({
    status: 'error',
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
  });
}

module.exports = { errorHandler };
