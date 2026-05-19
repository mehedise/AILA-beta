import * as XLSX from "xlsx";

export type ExcelLeadRow = {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  zipCode: string | null;
  country: string | null;
  annualRevenue: string | null;
  employeeHeadcount: string | null;
  logo: string | null;
  raw: Record<string, unknown>;
};

type LeadField = Exclude<keyof ExcelLeadRow, "raw" | "name">;

const HEADER_ALIASES: Record<LeadField, string[]> = {
  displayName: [
    "display_name",
    "displayname",
    "full_name",
    "fullname",
    "name",
    "contact_name",
  ],
  firstName: ["first_name", "firstname", "given_name", "givenname"],
  lastName: ["last_name", "lastname", "surname", "family_name", "familyname"],
  title: [
    "title",
    "position",
    "job_title",
    "designation",
    "role",
    "job_position",
  ],
  company: [
    "company",
    "company_name",
    "organization",
    "organisation",
    "business",
    "business_name",
    "employer",
  ],
  email: ["email", "email_address", "mail", "e_mail"],
  phone: [
    "office_tel",
    "office_phone",
    "office_telephone",
    "telephone",
    "tel",
    "phone",
    "work_phone",
    "direct_line",
    "phone_number",
    "contact",
  ],
  mobile: [
    "mobile",
    "mobile_contact",
    "mobile_phone",
    "mobile_number",
    "cell",
    "cellphone",
    "cellular",
    "cellular_phone",
    "hp",
  ],
  website: ["website", "web_site", "url", "company_website", "site", "web"],
  address: [
    "address",
    "street_address",
    "street",
    "address_line_1",
    "address1",
    "office_address",
  ],
  city: ["city", "town", "city_town"],
  zipCode: [
    "zip",
    "zip_code",
    "zipcode",
    "postal_code",
    "postalcode",
    "postcode",
  ],
  country: ["country", "country_region", "region", "nation"],
  annualRevenue: [
    "annual_revenue",
    "revenue",
    "yearly_revenue",
    "turnover",
    "annual_turnover",
    "sales",
  ],
  employeeHeadcount: [
    "employee_headcount",
    "headcount",
    "employees",
    "employee_count",
    "company_size",
    "team_size",
    "staff",
    "no_of_employees",
  ],
  logo: ["logo", "logo_url"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function parseExcelBuffer(buf: Buffer): ExcelLeadRow[] {
  const workbook = XLSX.read(buf, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0] ?? {});
  const normalizedToOriginal = new Map<string, string>();
  for (const header of headers) {
    normalizedToOriginal.set(normalizeHeader(header), header);
  }

  const resolveHeader = (aliases: string[]) => {
    for (const alias of aliases) {
      const original = normalizedToOriginal.get(alias);
      if (original) return original;
    }
    return undefined;
  };

  const headerIndex: Partial<Record<LeadField, string>> = {};
  (Object.keys(HEADER_ALIASES) as LeadField[]).forEach((field) => {
    headerIndex[field] = resolveHeader(HEADER_ALIASES[field]);
  });

  return rows
    .map((row) => {
      const get = (field: LeadField) => {
        const key = headerIndex[field];
        if (!key) return null;
        const val = row[key];
        const str = String(val ?? "").trim();
        return str || null;
      };

      const displayName = get("displayName");
      const firstName = get("firstName");
      const lastName = get("lastName");
      const composedName =
        displayName || [firstName, lastName].filter(Boolean).join(" ").trim() ||
        null;

      return {
        displayName: displayName || composedName,
        firstName,
        lastName,
        name: composedName,
        title: get("title"),
        company: get("company"),
        email: get("email"),
        phone: get("phone"),
        mobile: get("mobile"),
        website: get("website"),
        address: get("address"),
        city: get("city"),
        zipCode: get("zipCode"),
        country: get("country"),
        annualRevenue: get("annualRevenue"),
        employeeHeadcount: get("employeeHeadcount"),
        logo: get("logo"),
        raw: row,
      };
    })
    .filter(
      (r) =>
        r.name ||
        r.firstName ||
        r.lastName ||
        r.company ||
        r.email ||
        r.phone ||
        r.mobile ||
        r.website
    );
}
