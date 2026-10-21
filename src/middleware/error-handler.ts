import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

export interface AppError extends Error {
  statusCode?: number;
  expose?: boolean;
  type?: string;
}

export function createError(statusCode: number, message: string): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.expose = statusCode < 500;
  return error;
}

export function payloadTooLargeHandler(
  err: AppError,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    err.message?.includes("entity.too.large") ||
    err.type === "entity.too.large"
  ) {
    res
      .status(413)
      .json({ error: "Request payload too large. Maximum size is 256KB." });
    return;
  }
  next(err);
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Route not found" });
}

export function globalErrorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("Unhandled error:", err);

  const isProduction = env.NODE_ENV === "production";
  const statusCode = err.statusCode ?? 500;

  const response: Record<string, unknown> = {
    error: isProduction ? "Internal server error" : err.message,
  };

  if (!isProduction) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}
