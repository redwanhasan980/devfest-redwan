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

test('suggestions do not choose between ambiguous duplicate content', () => {
  const bytes = new Uint8Array([1]);
  const files: UploadedPdf[] = [
    { id: 'trade1', name: 'trade_license.pdf', size: 1, pages: 1, hash: 'dup', bytes },
    { id: 'trade2', name: 'trade_license_copy.pdf', size: 1, pages: 1, hash: 'dup', bytes },
  ];
  const matches = suggestAssignments([expiring], files, {});
  assert.equal(Object.values(matches).filter(Boolean).length, 0);
});

