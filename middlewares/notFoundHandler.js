/**
 * 404 Not Found handler middleware for undefined routes.
 */
export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    message: `Cannot ${req.method} ${req.originalUrl} - Route not found`
  });
};

export default notFoundHandler;
