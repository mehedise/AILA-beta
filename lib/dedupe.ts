import { createHash } from "crypto";

export function buildDedupeKey(fields: {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  company?: string | null;
}): string {
  const email = (fields.email ?? "").trim().toLowerCase();
  const phone = (fields.phone ?? "").replace(/\D/g, "");
  const name = (fields.name ?? "").trim().toLowerCase();
  const company = (fields.company ?? "").trim().toLowerCase();
  const raw = email || phone || `${name}|${company}`;
  return createHash("sha256").update(raw).digest("hex");
}
