export function billingError(message: string, status: number, code?: string) {
  return Object.assign(new Error(message), { status, code });
}

export function errorResponse(error: unknown) {
  const candidate = error as { status?: number; message?: string; code?: string };
  const status = Number(candidate?.status || 500);
  if (status >= 500) console.error("[billing]", error);
  return Response.json(
    {
      error: status >= 500 ? "Internal server error" : candidate?.message || "Request failed",
      ...(candidate?.code ? { code: candidate.code } : {}),
    },
    { status },
  );
}

export async function jsonBody(request: Request, maxBytes = 10_000) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) {
    throw billingError("Request body is too large", 413);
  }
  try {
    return await request.json();
  } catch {
    throw billingError("Invalid JSON body", 400);
  }
}
