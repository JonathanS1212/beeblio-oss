import { localAgentSecret } from "../lib/local-secret";

import {
  extractBearerToken,
  verifyJwtHmac,
  withAuthChallenges,
  type AuthFn,
} from "eve/channels/auth";

export const proxyUserAuth: AuthFn<Request> = withAuthChallenges(
  async (request: Request) => {
    const secret = localAgentSecret();

    const token = extractBearerToken(request.headers.get("authorization"));
    const result = await verifyJwtHmac(token, {
      algorithm: "HS256",
      issuer: "beeblio",
      audiences: ["beeblio-agent"],
      secret,
    });
    if (!result.ok) return null;

    const auth = result.sessionAuth;
    const userId = auth.subject ?? auth.principalId;
    const projectSlug = request.headers.get("x-project-slug") ?? undefined;
    const creditReservationId =
      request.headers.get("x-credit-reservation-id") ?? undefined;
    const creditExecutionClass =
      request.headers.get("x-credit-execution-class") ?? undefined;
    const modelSource = request.headers.get("x-model-source") ?? undefined;
    const modelId = request.headers.get("x-model-id") ?? undefined;
    const modelContextWindowTokens = request.headers.get("x-model-context-window-tokens") ?? undefined;
    const deadlineHeader = request.headers.get("x-turn-model-deadline-at");
    const deadline = deadlineHeader ? Number(deadlineHeader) : NaN;
    const turnModelDeadlineAt = Number.isSafeInteger(deadline) &&
      deadline > Date.now() - 60_000 && deadline <= Date.now() + 300_000
      ? deadline
      : undefined;

    return {
      ...auth,
      principalId: userId,
      principalType: "user",
      subject: userId,
      attributes: {
        ...auth.attributes,
        ...(projectSlug ? { projectSlug } : {}),
        ...(creditReservationId ? { creditReservationId } : {}),
        ...(creditExecutionClass ? { creditExecutionClass } : {}),
        ...(modelSource ? { modelSource } : {}),
        ...(modelId ? { modelId } : {}),
        ...(modelContextWindowTokens ? { modelContextWindowTokens } : {}),
        ...(turnModelDeadlineAt ? { turnModelDeadlineAt: String(turnModelDeadlineAt) } : {}),
      },
    };
  },
  [{ scheme: "Bearer" }],
);
