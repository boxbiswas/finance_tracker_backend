/**
 * Middleware factory that validates request body against a Zod schema.
 * Replaces req.body with the parsed/sanitized data on success,
 * or returns 400 Bad Request with formatted error details on failure.
 */
export const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req.body);
      req.body = parsed;
      next();
    } catch (err) {
      const issues = err.issues || err.errors || [];
      if (Array.isArray(issues) && issues.length > 0) {
        const errorMessages = issues.map(e => ({
          field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
          message: e.message
        }));

        return res.status(400).json({
          message: errorMessages[0]?.message || 'Validation failed',
          errors: errorMessages
        });
      }

      return res.status(400).json({
        message: 'Invalid request payload',
        error: err.message
      });
    }
  };
};

export default validateRequest;
