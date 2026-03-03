import { randomUUID } from 'node:crypto';

type HttpLogParams = {
  request: Request;
  route: string;
  status: number;
  startedAt: number;
  userId?: string | null;
  requestId?: string | null;
};

export function resolveRequestId(request: Request): string {
  const existing = request.headers.get('x-request-id');
  if (existing && existing.trim().length > 0) {
    return existing.trim();
  }
  return randomUUID();
}

export function logHttpRequest(params: HttpLogParams): void {
  const latencyMs = Date.now() - params.startedAt;
  console.info(JSON.stringify({
    type: 'http_request',
    requestId: params.requestId ?? resolveRequestId(params.request),
    route: params.route,
    method: params.request.method,
    status: params.status,
    latencyMs,
    userId: params.userId ?? null,
  }));
}
