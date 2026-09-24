export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const asSafeErrorCode = (error: unknown) => {
  if (error instanceof AppError) return error.code;
  if (typeof error === 'object' && error && 'code' in error && typeof error.code === 'string') {
    if (error.code === '57014') return 'QUERY_TIMEOUT';
    if (error.code === '55P03') return 'LOCK_TIMEOUT';
    if (error.code.startsWith('23')) return 'CONSTRAINT_VIOLATION';
  }
  return 'DATABASE_ERROR';
};
