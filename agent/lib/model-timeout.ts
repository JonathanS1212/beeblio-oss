// Bound OpenRouter waits, including streamed response bodies. Eve may retry a
// failed model step, so every attempt also shares the same turn deadline.
export const MODEL_REQUEST_TIMEOUT_MS = 90_000;
export const TURN_MODEL_DEADLINE_MS = 240_000;

export function turnModelDeadline(value: unknown): number | undefined {
  const deadline = Number(value);
  return Number.isSafeInteger(deadline) && deadline > 0 ? deadline : undefined;
}

export function timedModelFetch(deadline?: number): typeof fetch {
  return (input, init) => {
    const remaining = deadline === undefined
      ? MODEL_REQUEST_TIMEOUT_MS
      : Math.min(MODEL_REQUEST_TIMEOUT_MS, deadline - Date.now());
    if (remaining <= 0) {
      throw new Error("The model turn exceeded its four-minute deadline. Please try again.");
    }
    const timeout = AbortSignal.timeout(remaining);
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, timeout])
      : timeout;
    return fetch(input, { ...init, signal });
  };
}
