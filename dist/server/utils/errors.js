"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.catchAsync = catchAsync;
exports.buildErrorRef = buildErrorRef;
/**
 * Operational application error — thrown deliberately from route handlers.
 * Middleware picks up `statusCode` and `errorType` to send the right response.
 */
class AppError extends Error {
    constructor(message, statusCode, errorType = "server") {
        super(message);
        this.statusCode = statusCode;
        this.errorType = errorType;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
/**
 * Wraps an async route handler so unhandled promise rejections are forwarded
 * to the global error middleware via `next(err)` — no try/catch boilerplate needed.
 *
 * @example
 * app.get('/api/agencies/:id', catchAsync(async (req, res) => {
 *   const agency = await storage.getAgency(req.params.id);
 *   if (!agency) throw new AppError('Not found', 404, 'notfound');
 *   res.json(agency);
 * }));
 */
function catchAsync(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
/** Build the WAH-{code}-{timestamp} reference string */
function buildErrorRef(code) {
    return `WAH-${code}-${Date.now().toString().slice(-6)}`;
}
