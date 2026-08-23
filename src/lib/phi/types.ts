export type PhiCategory =
  | "name"
  | "dob"
  | "date"
  | "age"
  | "phone"
  | "fax"
  | "email"
  | "ssn"
  | "mrn"
  | "plan_id"
  | "account"
  | "npi"
  | "accession"
  | "license"
  | "device"
  | "url"
  | "ip"
  | "address"
  | "zip"
  | "org"
  | "other_id";

export type DetectorSource = "seed" | "label" | "regex" | "openmed" | "manual";

export type DateMode = "relative" | "year" | "keep";

export type PhiSpan = {
  id: string;
  start: number;
  end: number;
  text: string;
  category: PhiCategory;
  source: DetectorSource;
  confidence: number;
  accepted: boolean;
  label?: string;
};

export type IdentitySeed = {
  fullName: string;
  aliases: string;
  dob: string;
  mrn: string;
  phone: string;
  email: string;
  address: string;
  zip: string;
};

export const EMPTY_SEED: IdentitySeed = {
  fullName: "",
  aliases: "",
  dob: "",
  mrn: "",
  phone: "",
  email: "",
  address: "",
  zip: "",
};

export type ExtractorId = "layout" | "haseol" | "naive" | "legacy";

export type ExtractorSnapshot = {
  id: ExtractorId;
  label: string;
  hint: string;
  text: string;
  chars: number;
  lines: number;
  camelGlue: number;
  letterDigitGlue: number;
};

type ExtractedDocumentBase = {
  fileName: string;
  text: string;
  pages: { pageNumber: number; text: string }[];
  hasTextLayer: boolean;
  extractor?: ExtractorId;
  extractors?: ExtractorSnapshot[];
  warnings?: string[];
};

export type ExtractedPdf = ExtractedDocumentBase & {
  kind: "pdf";
  pageCount: number;
};

export type ExtractedDocx = ExtractedDocumentBase & {
  kind: "docx";
  pageCount: null;
};

export type ExtractedDocument = ExtractedPdf | ExtractedDocx;

export const CATEGORY_TOKEN: Record<PhiCategory, string> = {
  name: "[NAME]",
  dob: "[DOB]",
  date: "[DATE]",
  age: "[AGE]",
  phone: "[PHONE]",
  fax: "[FAX]",
  email: "[EMAIL]",
  ssn: "[SSN]",
  mrn: "[MRN]",
  plan_id: "[PLAN_ID]",
  account: "[ACCOUNT]",
  npi: "[NPI]",
  accession: "[ACCESSION]",
  license: "[LICENSE]",
  device: "[DEVICE_ID]",
  url: "[URL]",
  ip: "[IP]",
  address: "[ADDRESS]",
  zip: "[ZIP]",
  org: "[ORG]",
  other_id: "[ID]",
};

export const CATEGORY_LABEL: Record<PhiCategory, string> = {
  name: "Name",
  dob: "Date of birth",
  date: "Date",
  age: "Age 90+",
  phone: "Phone",
  fax: "Fax",
  email: "Email",
  ssn: "SSN",
  mrn: "Medical record no.",
  plan_id: "Plan / member ID",
  account: "Account no.",
  npi: "NPI",
  accession: "Accession / encounter",
  license: "License",
  device: "Device ID",
  url: "URL",
  ip: "IP address",
  address: "Address",
  zip: "ZIP code",
  org: "Organization",
  other_id: "Other ID",
};

export const REDACT_MENU_CATEGORIES: PhiCategory[] = [
  "name",
  "dob",
  "date",
  "phone",
  "email",
  "ssn",
  "mrn",
  "address",
  "zip",
  "account",
  "npi",
  "accession",
  "org",
  "other_id",
];

export const SAFE_HARBOR_DEFAULT_ON: ReadonlySet<PhiCategory> = new Set([
  "name",
  "dob",
  "date",
  "age",
  "phone",
  "fax",
  "email",
  "ssn",
  "mrn",
  "plan_id",
  "account",
  "npi",
  "accession",
  "license",
  "device",
  "url",
  "ip",
  "address",
  "zip",
  "other_id",
]);
