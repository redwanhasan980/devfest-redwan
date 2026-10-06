export type Language = 'en' | 'bn';

export type RequirementStatus =
  | 'missing'
  | 'expiry-needed'
  | 'expired'
  | 'not-provided'
  | 'ok';

export interface Tender {
  tender_id: string;
  title: string;
  procuring_entity: string;
  bidder: string;
  submission_deadline: string;
}

export interface Requirement {
  id: string;
  order: number;
  title_en: string;
  title_bn: string;
  mandatory: boolean;
  has_expiry: boolean;
}

export interface RequirementsData {
  tender: Tender;
  requirements: Requirement[];
}

export interface UploadedPdf {
  id: string;
  name: string;
  size: number;
  pages: number;
  hash: string;
  bytes: Uint8Array;
}

export interface AssignmentState {
  matches: Record<string, string | undefined>;
  expiries: Record<string, string | undefined>;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredText(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing or invalid field: ${key}`);
  }
  return value.trim();
}

export function parseRequirements(input: unknown): RequirementsData {
  if (!isRecord(input) || !isRecord(input.tender) || !Array.isArray(input.requirements)) {
    throw new Error('The file must contain tender details and a requirements list.');
  }

  const tenderInput = input.tender;
  const deadline = requiredText(tenderInput, 'submission_deadline');
  if (!isValidDateOnly(deadline)) {
    throw new Error('The submission deadline must be a valid YYYY-MM-DD date.');
  }

  const tender: Tender = {
    tender_id: requiredText(tenderInput, 'tender_id'),
    title: requiredText(tenderInput, 'title'),
    procuring_entity: requiredText(tenderInput, 'procuring_entity'),
    bidder: requiredText(tenderInput, 'bidder'),
    submission_deadline: deadline,
  };

  if (input.requirements.length === 0) {
    throw new Error('The requirements list cannot be empty.');
  }

  const seenIds = new Set<string>();
  const seenOrders = new Set<number>();
  const requirements = input.requirements.map((item, index): Requirement => {
    if (!isRecord(item)) throw new Error(`Requirement ${index + 1} is invalid.`);
    const id = requiredText(item, 'id');
    const order = item.order;
    if (!Number.isInteger(order) || Number(order) < 1) {
      throw new Error(`Requirement ${id} has an invalid order.`);
    }
    if (typeof item.mandatory !== 'boolean' || typeof item.has_expiry !== 'boolean') {
      throw new Error(`Requirement ${id} must define mandatory and has_expiry.`);
    }
    if (seenIds.has(id)) throw new Error(`Duplicate requirement id: ${id}`);
    if (seenOrders.has(Number(order))) throw new Error(`Duplicate requirement order: ${order}`);
    seenIds.add(id);
    seenOrders.add(Number(order));
    return {
      id,
      order: Number(order),
      title_en: requiredText(item, 'title_en'),
      title_bn: requiredText(item, 'title_bn'),
      mandatory: item.mandatory,
      has_expiry: item.has_expiry,
    };
  });

  requirements.sort((a, b) => a.order - b.order);
  return { tender, requirements };
}

export function getRequirementStatus(
  requirement: Requirement,
  fileId: string | undefined,
  expiry: string | undefined,
  deadline: string,
): RequirementStatus {
  if (!fileId) return requirement.mandatory ? 'missing' : 'not-provided';
  if (!requirement.has_expiry) return 'ok';
  if (!expiry || !isValidDateOnly(expiry)) return 'expiry-needed';
  return expiry < deadline ? 'expired' : 'ok';
}

export function isBlockingStatus(status: RequirementStatus): boolean {
  return status === 'missing' || status === 'expiry-needed' || status === 'expired';
}

export function getDuplicateHashes(files: UploadedPdf[]): Set<string> {
  const counts = new Map<string, number>();
  files.forEach((file) => counts.set(file.hash, (counts.get(file.hash) ?? 0) + 1));
  return new Set([...counts].filter(([, count]) => count > 1).map(([hash]) => hash));
}

export function canAssignFile(
  requirementId: string,
  fileId: string,
  files: UploadedPdf[],
  matches: AssignmentState['matches'],
): boolean {
  const candidate = files.find((file) => file.id === fileId);
  if (!candidate) return false;
  return !Object.entries(matches).some(([otherRequirementId, matchedFileId]) => {
    if (otherRequirementId === requirementId || !matchedFileId) return false;
    const matchedFile = files.find((file) => file.id === matchedFileId);
    return matchedFileId === fileId || matchedFile?.hash === candidate.hash;
  });
}

const genericWords = new Set([
  'certificate', 'cert', 'document', 'documents', 'proposal', 'registration', 'registered',
  'signed', 'copy', 'final', 'new', 'old', 'latest', 'valid', 'pdf', 'file',
  'সনদ', 'সনদপত্র', 'দলিল', 'নথি', 'প্রস্তাব', 'নিবন্ধন', 'স্বাক্ষরিত',
  'কপি', 'চূড়ান্ত', 'সর্বশেষ', 'বৈধ', 'পিডিএফ', 'ফাইল',
]);

const canonicalWords: Record<string, string> = {
  licence: 'license', authorisation: 'authorization', authorised: 'authorization', authorized: 'authorization',
  tech: 'technical', fin: 'financial', audited: 'audit', auditing: 'audit', accounts: 'financial',
  quotation: 'price', pricing: 'price', quote: 'price', boq: 'price',
  undertaking: 'declaration', affidavit: 'declaration', compliance: 'declaration',
  completed: 'experience', completion: 'experience', performance: 'experience',
  manufacturer: 'manufacturer', manufacturers: 'manufacturer', manufacture: 'manufacturer',
};

interface DocumentConcept { signals: string[]; aliases: string[] }

const documentLexicon: DocumentConcept[] = [
  { signals: ['trade license', 'ট্রেড লাইসেন্স'], aliases: ['trade license', 'trade licence', 'business license', 'business licence', 'tradelicense', 'ট্রেড লাইসেন্স', 'ব্যবসা লাইসেন্স', 'ব্যবসায়িক লাইসেন্স'] },
  { signals: ['tin', 'tax identification', 'টিআইএন'], aliases: ['tin', 'etin', 'e tin', 'tax identification', 'taxpayer identification', 'tax id', 'টিআইএন', 'ই টিআইএন', 'ইটিআইএন', 'করদাতা শনাক্তকরণ', 'কর শনাক্তকরণ নম্বর'] },
  { signals: ['vat', 'value added tax', 'ভ্যাট'], aliases: ['vat', 'bin', 'value added tax', 'business identification number', 'business identification', 'ভ্যাট', 'বিআইএন', 'মূল্য সংযোজন কর', 'ব্যবসায় শনাক্তকরণ নম্বর'] },
  { signals: ['bank solvency', 'solvency', 'ব্যাংক সচ্ছলতা'], aliases: ['bank solvency', 'solvency', 'bank certificate', 'financial capability', 'financial capacity', 'ব্যাংক সচ্ছলতা', 'ব্যাংক সলভেন্সি', 'আর্থিক সক্ষমতা', 'ব্যাংক প্রত্যয়ন'] },
  { signals: ['experience', 'অভিজ্ঞতা'], aliases: ['experience', 'work experience', 'completion', 'work completion', 'performance certificate', 'contract certificate', 'client certificate', 'অভিজ্ঞতা', 'কাজের অভিজ্ঞতা', 'কার্যসম্পাদন', 'কাজ সমাপ্তি', 'চুক্তি সম্পাদন'] },
  { signals: ['audit financial', 'financial statement', 'নিরীক্ষিত আর্থিক', 'আর্থিক বিবরণী'], aliases: ['audited financial', 'audit report', 'financial statement', 'balance sheet', 'income statement', 'annual accounts', 'নিরীক্ষিত আর্থিক বিবরণী', 'অডিট রিপোর্ট', 'আর্থিক বিবরণী', 'ব্যালেন্স শিট', 'আয় বিবরণী'] },
  { signals: ['manufacturer', 'প্রস্তুতকারক'], aliases: ['manufacturer authorization', 'manufacturer authorisation', 'manufacturers authorization', 'maf', 'oem authorization', 'oem authorisation', 'authorization letter', 'authorisation letter', 'প্রস্তুতকারকের অনুমোদন', 'উৎপাদনকারীর অনুমোদন', 'ম্যানুফ্যাকচারার অথরাইজেশন', 'ওইএম অনুমোদন'] },
  { signals: ['technical', 'কারিগরি'], aliases: ['technical', 'technical offer', 'technical bid', 'tech proposal', 'specification', 'compliance sheet', 'কারিগরি', 'কারিগরি প্রস্তাব', 'টেকনিক্যাল প্রস্তাব', 'প্রযুক্তিগত প্রস্তাব', 'বিস্তারিত কারিগরি বিবরণ'] },
  { signals: ['financial proposal', 'financial', 'আর্থিক প্রস্তাব'], aliases: ['financial proposal', 'financial offer', 'price proposal', 'price schedule', 'priced boq', 'boq', 'quotation', 'commercial offer', 'আর্থিক প্রস্তাব', 'মূল্য প্রস্তাব', 'দর প্রস্তাব', 'মূল্য তালিকা', 'বিওকিউ', 'বাণিজ্যিক প্রস্তাব'] },
  { signals: ['declaration', 'ঘোষণাপত্র'], aliases: ['declaration', 'signed declaration', 'undertaking', 'affidavit', 'declaration form', 'compliance declaration', 'ঘোষণা', 'ঘোষণাপত্র', 'স্বাক্ষরিত ঘোষণাপত্র', 'অঙ্গীকারনামা', 'হলফনামা', 'সম্মতিপত্র'] },
];

function normalized(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\.[^.]+$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .replace(/\p{N}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string, keepGeneric = false): string[] {
  return normalized(value)
    .split(/\s+/)
    .map((token) => canonicalWords[token] ?? token)
    .filter((token) => token.length > 1 && (keepGeneric || !genericWords.has(token)));
}

function hasPhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = normalized(phrase);
  return (` ${text} `).includes(` ${normalizedPhrase} `);
}

function compareFilePreference(a: UploadedPdf, b: UploadedPdf): number {
  const copyPenalty = (name: string) => /\b(copy|duplicate|backup)\b|\(\d+\)/i.test(name) ? 1 : 0;
  const newestYear = (name: string) => Math.max(0, ...[...name.matchAll(/(20\d{2})/g)].map((match) => Number(match[1])));
  return copyPenalty(a.name) - copyPenalty(b.name)
    || newestYear(b.name) - newestYear(a.name)
    || normalized(a.name).length - normalized(b.name).length
    || a.name.localeCompare(b.name);
}

export function matchScore(fileName: string, requirementTitle: string, alternateTitle = ''): number {
  const fileText = normalized(fileName);
  const titleTexts = [requirementTitle, alternateTitle].filter(Boolean).map(normalized);
  const titleText = titleTexts.join(' ');
  const fileTokens = new Set(tokens(fileName));
  const titleTokens = [...new Set(titleTexts.flatMap((title) => tokens(title)))];
  let score = titleTokens.length
    ? titleTokens.filter((token) => fileTokens.has(token)).length / titleTokens.length
    : 0;

  if (titleTexts.some((title) => title && hasPhrase(fileText, title))) score = Math.max(score, 1);

  const targetConcepts = documentLexicon.filter((concept) => concept.signals.some((signal) => titleTexts.some((title) => hasPhrase(title, signal))));
  for (const concept of targetConcepts) {
    for (const alias of concept.aliases) {
      if (hasPhrase(fileText, alias)) {
        const specificity = Math.min(tokens(alias, true).length * 0.08, 0.18);
        score = Math.max(score, 0.8 + specificity);
      }
    }
  }

  return Math.min(score, 1);
}

export function suggestAssignments(
  requirements: Requirement[],
  files: UploadedPdf[],
  currentMatches: AssignmentState['matches'],
): AssignmentState['matches'] {
  const matches = { ...currentMatches };
  const usedHashes = new Set<string>();
  const usedIds = new Set<string>();
  Object.values(matches).forEach((fileId) => {
    const file = files.find((candidate) => candidate.id === fileId);
    if (file) {
      usedIds.add(file.id);
      usedHashes.add(file.hash);
    }
  });

  const uniqueAvailable = [...files]
    .filter((file) => !usedIds.has(file.id) && !usedHashes.has(file.hash))
    .sort(compareFilePreference)
    .filter((file, index, all) => all.findIndex((candidate) => candidate.hash === file.hash) === index);

  const candidates = requirements
    .filter((requirement) => !matches[requirement.id])
    .flatMap((requirement) => uniqueAvailable.map((file) => ({
      requirement,
      file,
      score: matchScore(file.name, requirement.title_en, requirement.title_bn),
    })))
    .filter(({ score }) => score >= 0.45)
    .sort((a, b) => b.score - a.score || a.requirement.order - b.requirement.order || compareFilePreference(a.file, b.file));

  for (const candidate of candidates) {
    if (matches[candidate.requirement.id] || usedHashes.has(candidate.file.hash)) continue;
    matches[candidate.requirement.id] = candidate.file.id;
    usedIds.add(candidate.file.id);
    usedHashes.add(candidate.file.hash);
  }

  const remainingMandatory = requirements.filter((requirement) => requirement.mandatory && !matches[requirement.id]);
  const alreadySatisfied = requirements.filter((requirement) => matches[requirement.id]);
  const remainingFiles = uniqueAvailable
    .filter((file) => !usedHashes.has(file.hash))
    .filter((file) => !alreadySatisfied.some((requirement) => matchScore(file.name, requirement.title_en, requirement.title_bn) >= 0.45));
  if (remainingMandatory.length === 1 && remainingFiles.length === 1) {
    matches[remainingMandatory[0].id] = remainingFiles[0].id;
  }
  return matches;
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = bytes.slice().buffer;
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

