import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAssignFile,
  getRequirementStatus,
  isValidDateOnly,
  matchScore,
  parseRequirements,
  suggestAssignments,
  type Requirement,
  type UploadedPdf,
} from './engine.ts';

const expiring: Requirement = {
  id: 'R1', order: 1, title_en: 'Trade License', title_bn: 'ট্রেড লাইসেন্স', mandatory: true, has_expiry: true,
};

test('date-only validation rejects impossible dates', () => {
  assert.equal(isValidDateOnly('2026-02-29'), false);
  assert.equal(isValidDateOnly('2026-10-20'), true);
});

test('status rules treat deadline equality as OK', () => {
  assert.equal(getRequirementStatus(expiring, undefined, undefined, '2026-10-20'), 'missing');
  assert.equal(getRequirementStatus(expiring, 'f1', undefined, '2026-10-20'), 'expiry-needed');
  assert.equal(getRequirementStatus(expiring, 'f1', '2026-10-19', '2026-10-20'), 'expired');
  assert.equal(getRequirementStatus(expiring, 'f1', '2026-10-20', '2026-10-20'), 'ok');
});

test('optional unmatched requirement is not provided', () => {
  assert.equal(getRequirementStatus({ ...expiring, mandatory: false }, undefined, undefined, '2026-10-20'), 'not-provided');
});

test('requirements parse and sort by order', () => {
  const parsed = parseRequirements({
    tender: { tender_id: 'T1', title: 'Title', procuring_entity: 'Entity', bidder: 'Bidder', submission_deadline: '2026-10-20' },
    requirements: [
      { ...expiring, id: 'R2', order: 2 },
      { ...expiring, id: 'R1', order: 1 },
    ],
  });
  assert.deepEqual(parsed.requirements.map((item) => item.id), ['R1', 'R2']);
});

test('duplicate content cannot be assigned to another requirement', () => {
  const base = { size: 1, pages: 1, bytes: new Uint8Array([1]) };
  const files: UploadedPdf[] = [
    { ...base, id: 'a', name: 'one.pdf', hash: 'same' },
    { ...base, id: 'b', name: 'copy.pdf', hash: 'same' },
  ];
  assert.equal(canAssignFile('R2', 'b', files, { R1: 'a' }), false);
  assert.equal(canAssignFile('R1', 'a', files, { R1: 'a' }), true);
});

test('filename matching ignores misleading numeric prefixes', () => {
  assert.ok(matchScore('01_financial_proposal.pdf', 'Financial Proposal') >= 0.5);
  assert.equal(matchScore('01_financial_proposal.pdf', 'Technical Proposal'), 0);
});

test('filename matching understands common tender-document aliases', () => {
  assert.ok(matchScore('e-TIN_taxpayer_ID.pdf', 'TIN Certificate') >= 0.8);
  assert.ok(matchScore('BIN_number.pdf', 'VAT Registration Certificate') >= 0.8);
  assert.ok(matchScore('OEM_authorisation_letter.pdf', "Manufacturer's Authorization") >= 0.8);
  assert.ok(matchScore('priced_BOQ.pdf', 'Financial Proposal') >= 0.8);
  assert.equal(matchScore('technical_offer.pdf', 'Financial Proposal'), 0);
});

test('filename matching understands Bangla procurement terminology', () => {
  assert.ok(matchScore('ট্রেড_লাইসেন্স_২০২৬.pdf', 'Trade License', 'ট্রেড লাইসেন্স') >= 0.8);
  assert.ok(matchScore('বিআইএন_সনদ.pdf', 'VAT Registration Certificate', 'ভ্যাট নিবন্ধন সনদ') >= 0.8);
  assert.ok(matchScore('কারিগরি_প্রস্তাব.pdf', 'Technical Proposal', 'কারিগরি প্রস্তাব') >= 0.8);
  assert.ok(matchScore('স্বাক্ষরিত_ঘোষণাপত্র.pdf', 'Signed Declaration', 'স্বাক্ষরিত ঘোষণাপত্র') >= 0.8);
  assert.equal(matchScore('আর্থিক_প্রস্তাব.pdf', 'Technical Proposal', 'কারিগরি প্রস্তাব'), 0);
});

test('suggestions deterministically collapse duplicate content', () => {
  const bytes = new Uint8Array([1]);
  const files: UploadedPdf[] = [
    { id: 'trade1', name: 'trade_license.pdf', size: 1, pages: 1, hash: 'dup', bytes },
    { id: 'trade2', name: 'trade_license_copy.pdf', size: 1, pages: 1, hash: 'dup', bytes },
  ];
  const matches = suggestAssignments([expiring], files, {});
  assert.equal(matches.R1, 'trade1');
});

test('unidentified scans stay unassigned even with one remaining slot', () => {
  const bytes = new Uint8Array([1]);
  const declaration: Requirement = { id: 'R10', order: 10, title_en: 'Signed Declaration', title_bn: 'ঘোষণা', mandatory: true, has_expiry: false };
  const files: UploadedPdf[] = [{ id: 'scan', name: 'scan_0042.pdf', size: 1, pages: 1, hash: 'scan', bytes }];
  assert.equal(suggestAssignments([declaration], files, {}).R10, undefined);
});

test('suggestions prefer the latest named document and ignore its older alternative', () => {
  const bytes = new Uint8Array([1]);
  const declaration: Requirement = { id: 'R10', order: 10, title_en: 'Signed Declaration', title_bn: 'ঘোষণা', mandatory: true, has_expiry: false };
  const files: UploadedPdf[] = [
    { id: 'old', name: 'trade_license_2025.pdf', size: 1, pages: 1, hash: 'old', bytes },
    { id: 'new', name: 'trade_license_2026.pdf', size: 1, pages: 1, hash: 'new', bytes },
    { id: 'scan', name: 'scan_0042.pdf', size: 1, pages: 1, hash: 'scan', bytes },
  ];
  const matches = suggestAssignments([expiring, declaration], files, {});
  assert.equal(matches.R1, 'new');
  assert.equal(matches.R10, undefined);
});

test('specific financial documents never cross-match', () => {
  assert.equal(matchScore('audited_financial_statements.pdf', 'Financial Proposal'), 0);
  assert.equal(matchScore('financial_proposal.pdf', 'Audited Financial Statement'), 0);
  assert.equal(matchScore('bank_statement.pdf', 'Bank Solvency Certificate'), 0);
  assert.equal(matchScore('tax_return_2026.pdf', 'TIN Certificate'), 0);
  assert.equal(matchScore('performance_bond.pdf', 'Bid Security'), 0);
  assert.equal(matchScore('import_registration.pdf', 'Export Registration Certificate'), 0);
});

test('expanded procurement lexicon recognizes acronyms and Bengali aliases', () => {
  for (const [name, title] of [
    ['EMD.pdf', 'Tender Security'], ['POA.pdf', 'Power of Attorney'],
    ['RJSC.pdf', 'Certificate of Incorporation'], ['MOA.pdf', 'Memorandum of Association'],
    ['QMS.pdf', 'ISO Certificate'], ['JVCA.pdf', 'Joint Venture Agreement'],
    ['NID.pdf', 'National ID'], ['IRC.pdf', 'Import Registration Certificate'],
    ['ERC.pdf', 'Export Registration Certificate'], ['credit_facility.pdf', 'Line of Credit'],
    ['পে_অর্ডার.pdf', 'Tender Security'], ['রিটার্ন_দাখিল.pdf', 'Tax Clearance'],
    ['ফায়ার_লাইসেন্স.pdf', 'Fire License'], ['বিক্রয়োত্তর_সেবা.pdf', 'Warranty'],
    ['company_profile.pdf', 'Company Profile'], ['delivery_plan.pdf', 'Delivery Schedule'],
  ]) assert.ok(matchScore(name, title) >= 0.8, `${name} → ${title}`);
});

test('date-only validation handles leap years and rejects malformed dates', () => {
  for (const value of ['2024-02-29', '2000-02-29', '0099-12-31']) assert.ok(isValidDateOnly(value));
  for (const value of ['1900-02-29', '2026-04-31', '2026-00-10', '2026-13-10', '2026-1-01', '2026-01-00', '', null, 20261020]) assert.equal(isValidDateOnly(value), false);
});

test('optional provided but expired documents still block submission', () => {
  assert.equal(getRequirementStatus({ ...expiring, mandatory: false }, 'file', '2025-01-01', '2026-10-20'), 'expired');
  assert.equal(getRequirementStatus(expiring, 'file', '2026-02-30', '2026-10-20'), 'expiry-needed');
});

test('schema rejects duplicate orders, duplicate ids, reserved keys and wrong booleans', () => {
  const tender = { tender_id: 'T1', title: 'Title', procuring_entity: 'Entity', bidder: 'Bidder', submission_deadline: '2026-10-20' };
  for (const requirements of [[], [expiring, expiring], [expiring, { ...expiring, id: 'R2' }], [{ ...expiring, id: '__proto__' }], [{ ...expiring, mandatory: 'true' }], [{ ...expiring, order: 1.5 }]]) {
    assert.throws(() => parseRequirements({ tender, requirements }));
  }
  assert.throws(() => parseRequirements({ tender: { ...tender, submission_deadline: '2026-02-29' }, requirements: [expiring] }));
});

test('suggestions repair stale matches while preserving valid manual choices', () => {
  const files: UploadedPdf[] = [{ id: 'new', name: 'trade_license.pdf', size: 1, pages: 1, hash: 'unique', bytes: new Uint8Array([1]) }];
  assert.equal(suggestAssignments([expiring], files, { R1: 'deleted' }).R1, 'new');
  assert.equal(suggestAssignments([expiring], files, { R1: 'new' }).R1, 'new');
  assert.equal(suggestAssignments([expiring], files, { OTHER: 'new' }).OTHER, undefined);
});

test('generic filenames, numeric noise and substring collisions do not match', () => {
  for (const name of ['certificate.pdf', 'scan_2026.pdf', '123.pdf', 'proposal.pdf']) assert.equal(matchScore(name, 'Technical Proposal'), 0);
  assert.equal(matchScore('printing.pdf', 'TIN Certificate'), 0);
  assert.equal(matchScore('private.pdf', 'VAT Registration Certificate'), 0);
});

