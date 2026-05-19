import { parsePhoneNumberFromString } from "libphonenumber-js";

export function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : null;
}

export function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const parsed = parsePhoneNumberFromString(phone, "US");
  if (parsed?.isValid()) return parsed.format("E.164");
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 ? digits : phone.trim() || null;
}

export function normalizeWebsite(website: string | null): string | null {
  if (!website) return null;
  let url = website.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return website.trim();
  }
}

export function logoFromWebsite(website: string | null): string | null {
  const host = normalizeWebsite(website);
  if (!host) return null;
  return `https://logo.clearbit.com/${host}`;
}
