// errors/CustomErrors.js
// Custom error classes for structured error handling

/**
 * Base application error
 * All custom errors extend this class
 */
class AppError extends Error {
  constructor(message, code, statusCode = 500, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        name: this.name,
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        details: this.details,
        timestamp: this.timestamp
      }
    };
  }
}

/**
 * Configuration error
 * Thrown when configuration is invalid or missing
 */
class ConfigError extends AppError {
  constructor(message, details = {}) {
    super(
      `Configuration error: ${message}`,
      'CONFIG_ERROR',
      500,
      details
    );
  }
}

/**
 * Validation error
 * Thrown when data validation fails
 */
class ValidationError extends AppError {
  constructor(message, details = {}, field = null) {
    super(
      field ? `Validation failed for ${field}: ${message}` : `Validation failed: ${message}`,
      'VALIDATION_ERROR',
      400,
      details
    );
    this.field = field;
  }
}

/**
 * Authentication error
 * Thrown when authentication fails or credentials are invalid
 */
class AuthenticationError extends AppError {
  constructor(message, details = {}) {
    super(
      `Authentication failed: ${message}`,
      'AUTH_ERROR',
      401,
      details
    );
  }
}

/**
 * Service error
 * Thrown when a service operation fails
 */
class ServiceError extends AppError {
  constructor(message, service = 'unknown', details = {}) {
    super(
      `Service '${service}' error: ${message}`,
      'SERVICE_ERROR',
      503,
      details
    );
    this.service = service;
  }
}

/**
 * Rate limit error
 * Thrown when API rate limits are exceeded
 */
class RateLimitError extends AppError {
  constructor(message, retryAfter = null, details = {}) {
    super(
      `Rate limit exceeded: ${message}`,
      'RATE_LIMIT_ERROR',
      429,
      { retryAfter, ...details }
    );
    this.retryAfter = retryAfter;
  }
}

/**
 * Permission error
 * Thrown when user doesn't have required permissions
 */
class PermissionError extends AppError {
  constructor(message, requiredLevel = null, details = {}) {
    super(
      `Permission denied: ${message}`,
      'PERMISSION_ERROR',
      403,
      { requiredLevel, ...details }
    );
    this.requiredLevel = requiredLevel;
  }
}

/**
 * Not found error
 * Thrown when requested resource doesn't exist
 */
class NotFoundError extends AppError {
  constructor(message, resource = null, details = {}) {
    super(
      `Not found: ${message}`,
      'NOT_FOUND_ERROR',
      404,
      { resource, ...details }
    );
    this.resource = resource;
  }
}

/**
 * Conflict error
 * Thrown when operation conflicts with existing state
 */
class ConflictError extends AppError {
  constructor(message, conflictingResource = null, details = {}) {
    super(
      `Conflict: ${message}`,
      'CONFLICT_ERROR',
      409,
      { conflictingResource, ...details }
    );
    this.conflictingResource = conflictingResource;
  }
}

/**
 * Duplicate error
 * Thrown when duplicate entries are detected
 */
class DuplicateError extends AppError {
  constructor(message, duplicateId = null, details = {}) {
    super(
      `Duplicate detected: ${message}`,
      'DUPLICATE_ERROR',
      409,
      { duplicateId, ...details }
    );
    this.duplicateId = duplicateId;
  }
}

// HTTP status codes helper
const HttpStatus = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMIT: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

module.exports = {
  AppError,
  ConfigError,
  ValidationError,
  AuthenticationError,
  ServiceError,
  RateLimitError,
  PermissionError,
  NotFoundError,
  ConflictError,
  DuplicateError,
  HttpStatus
};
