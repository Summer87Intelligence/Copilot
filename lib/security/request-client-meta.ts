/**
 * IP de cliente para rate limit / auditoría (headers de proxy).
 */
export function getRequestClientMeta(request: Request): {
  ip: string | null;
  userAgent: string | null;
} {
  const h = request.headers;
  const forwarded = h.get("x-forwarded-for");
  const ipFromForwarded = forwarded?.split(",")[0]?.trim() ?? null;
  const realIp = h.get("x-real-ip")?.trim() ?? null;
  const ip = ipFromForwarded || realIp || null;
  const userAgent = h.get("user-agent")?.trim() ?? null;
  return { ip, userAgent };
}
