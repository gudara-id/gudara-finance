function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || mapDatabaseError(error) || 500;

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    error: {
      message: statusCode >= 500 ? "Internal server error" : error.message,
      details: error.details
    }
  });
}

function mapDatabaseError(error) {
  if (error.code === "23505") {
    error.message = "Duplicate data violates a unique constraint";
    return 409;
  }

  if (error.code === "23503") {
    error.message = "Referenced data does not exist or is still being used";
    return 409;
  }

  if (error.code === "22P02") {
    error.message = "Invalid database value";
    return 422;
  }

  return null;
}

module.exports = errorHandler;
