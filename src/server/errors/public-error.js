'use strict';

class PublicError extends Error {
  constructor({ statusCode = 500, code = 'INTERNAL_ERROR', message = 'Internal server error' } = {}) {
    super(message);
    this.name = 'PublicError';
    this.statusCode = statusCode;
    this.code = code;
    this.publicMessage = message;
  }
}

module.exports = { PublicError };
