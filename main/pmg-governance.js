// pmg-governance.js
// Gouvernance documentaire PMG
// Nommage : PMG-<DOMAINE>-<TYPE>-<ID>-<LANG>-v<MAJ>.<MIN>.<PATCH>.ext

export const DOMAINS = {
  OPS:   "Operations",           // Process, procédures studio, logistique
  HR:    "Human Resources",      // Recrutement, contrats employés, formation
  LEGAL: "Legal & Compliance",   // Contrats, politiques légales, autorisations
  IT:    "Information Technology", // Sécurité, infrastructure, dev
  FIN:   "Finance & Accounting", // Transactions, rapports, audits
  MKT:   "Marketing & Communication", // Branding, campagnes, templates
};

export const TYPES = {
  SOP:   "Standard Operating Procedure",
  POL:   "Policy",
  WI:    "Work Instruction",
  CHK:   "Checklist",
  TPL:   "Template",
  CTR:   "Contract",
  MNL:   "Manual",
  OFFER: "Commercial Offer",
  ASSET: "Asset Document",
  INV:   "Invoice",
  QUO:   "Quotation",
  REC:   "Receipt",
};

export const LANGS = { FR: "FR", EN: "EN", HT: "HT" }; // HT = Créole haïtien

/** Statut documentaire (brouillon, template, final, etc.) — pas le type (contrat = CTR en type) */
export const STATUS = {
  DRAFT:    "Brouillon",
  TEMPLATE: "Template",
  FINAL:    "Final",
  REVIEW:   "En révision",
  SIGNED:   "Signé",
  OTHER:    "Autre",
};

/** Extensions supportées pour l'archivage */
export const SUPPORTED_EXT = [
  '.gdoc', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp4', '.mov', '.avi', '.webm', '.mkv',
  '.txt', '.rtf', '.odt', '.ods', '.odp',
];

/**
 * Regex stricte :
 * PMG-<DOMAINE>-<TYPE>-<IDSEQ>-<LANG>-v<MAJ>.<MIN>.<PATCH>.<ext>
 * - DOMAINE : OPS|HR|LEGAL|IT|FIN|MKT
 * - TYPE    : + INV|QUO|REC ajoutés
 */
const RX = /^PMG-(OPS|HR|LEGAL|IT|FIN|MKT)-(SOP|POL|WI|CHK|TPL|CTR|MNL|OFFER|ASSET|INV|QUO|REC)-(\d{3})-(FR|EN|HT)-v(\d+)\.(\d+)\.(\d+)(\.[A-Za-z0-9]+)$/i;

export function parsePMGName(filename) {
  const m = filename.match(RX);
  if (!m) return null;
  const [, domain, type, idSeq, lang, vMaj, vMin, vPatch, ext] = m;
  return {
    domain,
    type,
    idSeq,
    lang,
    vMajor: Number(vMaj),
    vMinor: Number(vMin),
    vPatch: Number(vPatch),
    ext: ext.toLowerCase(),
  };
}

export function targetPath(baseDir, parsed) {
  const d = DOMAINS[parsed.domain.toUpperCase()] || parsed.domain;
  const t = TYPES[parsed.type.toUpperCase()] || parsed.type;
  const L = LANGS[parsed.lang.toUpperCase()] || parsed.lang;
  return [d, t, L].join("/");
}

/**
 * Génère le nom d'archive PMG : PMG-<DOMAINE>-<TYPE>-<ID>-<LANG>-v<MAJ>.<MIN>.<PATCH>.ext
 * Version selon statut : DRAFT → v0.9.0, autre → v1.0.0
 */
export function generateArchiveName(domain, type, idSeq, lang, ext, status = null) {
  const extNorm = ext.startsWith('.') ? ext.toLowerCase() : '.' + ext.toLowerCase();
  const idStr = String(idSeq).padStart(3, '0');
  const version = (status === 'DRAFT') ? 'v0.9.0' : 'v1.0.0';
  return `PMG-${domain}-${type}-${idStr}-${lang}-${version}${extNorm}`;
}

export function isSupportedExt(ext) {
  const e = ext.toLowerCase();
  const normalized = e.startsWith('.') ? e : '.' + e;
  return SUPPORTED_EXT.includes(normalized);
}
