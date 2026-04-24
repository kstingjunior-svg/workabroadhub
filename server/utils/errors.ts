import type { Request, Response, NextFunction } from "express";

export type ErrorType =
  | "payment"
  | "network"
  | "auth"
  | "validation"
  | "notfound"
  | "server"
  | "general";

/**
 * Operational application error — thrown deliberately from route handlers.
 * Middleware picks up `statusCode` and `errorType` to send the right response.
 */
export class AppError extends Error {
  statusCode: number;
  errorType: ErrorType;
  isOperational: boolean;

  constructor(message: string, statusCode: number, errorType: ErrorType = "server") {
    super(message);
    this.statusCode = statusCode;
    this.errorType = errorType;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

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
export function catchAsync(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/** Build the WAH-{code}-{timestamp} reference string */
export function buildErrorRef(code: number | string): string {
  return `WAH-${code}-${Date.now().toString().slice(-6)}`;
}
