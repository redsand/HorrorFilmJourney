const originalFetch = globalThis.fetch?.bind(globalThis);

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const target = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  throw new Error(`Network access is disabled in tests. Mock fetch explicitly. Attempted: ${target}`);
}) as typeof fetch;

// Allow explicit restoration inside a specific test when needed.
export function restoreTestFetch(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
}
