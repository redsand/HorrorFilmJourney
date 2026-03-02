export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ data, error: null }, init);
}

export function fail(error: ApiError, status: number): Response {
  return Response.json({ data: null, error }, { status });
}
