import type { NextFunction, Request, Response } from 'express';
import type { ApiError } from '../../../shared/types.js';
import { logger } from './logger.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(_req: Request, res: Response) {
  const body: ApiError = { error: { code: 'not_found', message: 'Route not found' } };
  res.status(404).json(body);
}

// Express identifies error middleware by arity, so all four parameters are required.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    const body: ApiError = { error: { code: err.code, message: err.message } };
    res.status(err.status).json(body);
    return;
  }
  logger.error({ err, path: req.path }, 'unhandled error');
  const body: ApiError = { error: { code: 'internal_error', message: 'Something went wrong. Please try again.' } };
  res.status(500).json(body);
}
