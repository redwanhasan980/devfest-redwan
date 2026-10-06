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

function tokens(value: string): string[] {
  const stop = new Set(['certificate', 'document', 'proposal', 'registration', 'signed']);
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stop.has(token));
}

export function matchScore(fileName: string, requirementTitle: string): number {
  const fileTokens = new Set(tokens(fileName));
  const titleTokens = tokens(requirementTitle);
  if (!titleTokens.length) return 0;
  const hits = titleTokens.filter((token) => fileTokens.has(token)).length;
  return hits / titleTokens.length;
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

  requirements.forEach((requirement) => {
    if (matches[requirement.id]) return;
    const candidates = files
      .filter((file) => !usedIds.has(file.id) && !usedHashes.has(file.hash))
      .map((file) => ({ file, score: matchScore(file.name, requirement.title_en) }))
      .filter(({ score }) => score >= 0.5)
      .sort((a, b) => b.score - a.score || a.file.name.localeCompare(b.file.name));
    if (candidates.length && (candidates.length === 1 || candidates[0].score > candidates[1].score)) {
      matches[requirement.id] = candidates[0].file.id;
      usedIds.add(candidates[0].file.id);
      usedHashes.add(candidates[0].file.hash);
    }
  });
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

