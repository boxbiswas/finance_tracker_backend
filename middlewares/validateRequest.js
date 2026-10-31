// Middleware that validates request body against a Zod schema
export const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      // Parse and sanitize request body
      const parsed = schema.parse(req.body);
      req.body = parsed;
      next();
    } catch (err) {
      const issues = err.issues || err.errors || [];
      if (Array.isArray(issues) && issues.length > 0) {
        // Map individual Zod issues to clear field error messages
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

// Middleware that validates query parameters against a Zod schema
export const validateQuery = (schema) => {
  return (req, res, next) => {
    try {
      // Parse and sanitize query parameters
      const parsed = schema.parse(req.query);

      // In Express 5, req.query is a getter; use Object.defineProperty to assign parsed values
      Object.defineProperty(req, 'query', {
        value: parsed,
        writable: true,
        enumerable: true,
        configurable: true
      });
      req.validatedQuery = parsed;
      next();
    } catch (err) {
      const issues = err.issues || err.errors || [];
      if (Array.isArray(issues) && issues.length > 0) {
        // Map validation issues to readable query error list
        const errorMessages = issues.map(e => ({
          field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
          message: e.message
        }));

        return res.status(400).json({
          message: errorMessages[0]?.message || 'Query validation failed',
          errors: errorMessages
        });
      }

      return res.status(400).json({
        message: 'Invalid query parameters',
        error: err.message
      });
    }
  };
};

export default validateRequest;
