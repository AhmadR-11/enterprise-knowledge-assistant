// backend/src/utils/apiResponse.js

/**
 * Send standard success API response
 * Polymorphic helper that supports both signatures:
 *   successResponse(res, message, data = {}, statusCode = 200)
 *   successResponse(res, data, message = '...', statusCode = 200)
 */
const successResponse = (res, arg2, arg3 = {}, statusCode = 200) => {
  let message = 'Operation successful';
  let data = {};
  let code = statusCode;

  if (typeof arg2 === 'string') {
    message = arg2;
    data = (arg3 !== undefined && arg3 !== null) ? arg3 : {};
  } else if (typeof arg3 === 'string') {
    message = arg3;
    data = (arg2 !== undefined && arg2 !== null) ? arg2 : {};
  } else {
    data = (arg2 !== undefined && arg2 !== null) ? arg2 : {};
    if (typeof arg3 === 'number') {
      code = arg3;
    }
  }

  if (typeof arg3 === 'number') {
    code = arg3;
  }

  return res.status(code).json({
    success: true,
    message,
    data
  });
};

/**
 * Send standard error API response
 */
const errorResponse = (res, message, statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message
  };
  if (errors) {
    response.errors = errors;
  }
  return res.status(statusCode).json(response);
};

module.exports = {
  successResponse,
  errorResponse
};
