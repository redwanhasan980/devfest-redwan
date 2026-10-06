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

test('suggestions deterministically collapse duplicate content', () => {
  const bytes = new Uint8Array([1]);
  const files: UploadedPdf[] = [
    { id: 'trade1', name: 'trade_license.pdf', size: 1, pages: 1, hash: 'dup', bytes },
    { id: 'trade2', name: 'trade_license_copy.pdf', size: 1, pages: 1, hash: 'dup', bytes },
  ];
  const matches = suggestAssignments([expiring], files, {});
  assert.equal(matches.R1, 'trade1');
});

test('suggestions infer a single remaining mandatory slot', () => {
  const bytes = new Uint8Array([1]);
  const declaration: Requirement = { id: 'R10', order: 10, title_en: 'Signed Declaration', title_bn: 'ঘোষণা', mandatory: true, has_expiry: false };
  const files: UploadedPdf[] = [{ id: 'scan', name: 'scan_0042.pdf', size: 1, pages: 1, hash: 'scan', bytes }];
  assert.equal(suggestAssignments([declaration], files, {}).R10, 'scan');
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
  assert.equal(matches.R10, 'scan');
});

