// Centralized Express Error Handling Middleware per Clarivo DESIGN.md
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'An unexpected error occurred. Please try again.';

  // Handle Zod validation errors if forwarded
  if (err.name === 'ZodError' && Array.isArray(err.issues)) {
    statusCode = 400;
    message = err.issues[0]?.message || 'Validation failed';
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    const errors = Object.values(err.errors || {}).map(el => el.message);
    message = errors.join(', ') || 'Validation error';
  }

  // Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    statusCode = 409;
    if (err.keyPattern?.category && err.keyPattern?.monthStart) {
      message = 'A budget for this category and month already exists. You can edit the existing budget instead.';
    } else if (err.keyPattern?.email) {
      message = 'An account with this email address already exists. Please log in instead.';
    } else {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    }
  }

  // Mongoose invalid ObjectId (CastError)
  if (err.name === 'CastError') {
    statusCode = 404;
    message = 'Resource not found with the requested identifier';
  }

  // JWT verification errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication session. Please log in again.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your session has expired. Please log in again.';
  }

  // Sanitize message to never expose internal URIs, keys, or passwords
  const sanitizedMessage = String(message)
    .replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, '[DATABASE_URI_REDACTED]')
    .replace(/AIza[0-9A-Za-z-_]{35}/g, '[KEY_REDACTED]')
    .replace(/sk-[0-9A-Za-z]{20,}/g, '[KEY_REDACTED]');

  console.error(`[ERROR ${statusCode}]: ${sanitizedMessage}`);

  // Never leak raw stack traces or internal secrets to client
  res.status(statusCode).json({
    message: sanitizedMessage
  });
};

export default errorHandler;
