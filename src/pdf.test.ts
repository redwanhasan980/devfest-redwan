import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from 'pdf-lib';
import { createTenderPackage } from './pdf.ts';
import type { Requirement, RequirementsData, UploadedPdf } from './engine.ts';

const requirement: Requirement = { id: 'R1', order: 1, title_en: 'Technical Proposal', title_bn: 'কারিগরি প্রস্তাব', mandatory: true, has_expiry: false };
const data: RequirementsData = { tender: { tender_id: 'TEST', title: 'Test tender', procuring_entity: 'Example entity', bidder: 'Example bidder', submission_deadline: '2026-10-20' }, requirements: [requirement] };
async function sourceFile(rotation = 0): Promise<UploadedPdf> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 600]);
  page.setRotation(degrees(rotation));
  const bytes = await pdf.save();
  return { id: 'file', name: 'technical.pdf', size: bytes.length, pages: 1, hash: 'unique', bytes };
}

test('PDF export rejects missing required files even outside the UI', async () => {
  await assert.rejects(createTenderPackage({ data, files: [], assignments: { matches: {}, expiries: {} }, includeIndex: true, madeOn: '2026-10-06' }), /Resolve/);
});

test('PDF export rejects stale and duplicate content assignments', async () => {
  const file = await sourceFile();
  const duplicateData = { ...data, requirements: [requirement, { ...requirement, id: 'R2', order: 2 }] };
  await assert.rejects(createTenderPackage({ data: duplicateData, files: [file], assignments: { matches: { R1: 'file', R2: 'file' }, expiries: {} }, includeIndex: false, madeOn: '2026-10-06' }), /duplicate/);
  await assert.rejects(createTenderPackage({ data, files: [file], assignments: { matches: { R1: 'deleted' }, expiries: {} }, includeIndex: false, madeOn: '2026-10-06' }), /Missing/);
});

test('blank PDF pages export with reserved footer space', async () => {
  const file = await sourceFile();
  const result = await createTenderPackage({ data, files: [file], assignments: { matches: { R1: 'file' }, expiries: {} }, includeIndex: true, madeOn: '2026-10-06' });
  assert.equal(result.pageCount, 3);
  const output = await PDFDocument.load(result.bytes);
  assert.deepEqual(output.getPage(2).getSize(), { width: 400, height: 638 });
  assert.equal(result.fileName, 'TEST_Package.pdf');
});

test('rotated pages preserve visible orientation and source size', async () => {
  for (const rotation of [90, 180, 270]) {
    const file = await sourceFile(rotation);
    const result = await createTenderPackage({ data, files: [file], assignments: { matches: { R1: 'file' }, expiries: {} }, includeIndex: false, madeOn: '2026-10-06' });
    const output = await PDFDocument.load(result.bytes);
    assert.deepEqual(output.getPage(1).getSize(), rotation === 180 ? { width: 400, height: 638 } : { width: 600, height: 438 });
  }
});

test('optional unmatched documents do not add pages', async () => {
  const file = await sourceFile();
  const optionalData = { ...data, requirements: [requirement, { ...requirement, id: 'R2', order: 2, mandatory: false }] };
  const result = await createTenderPackage({ data: optionalData, files: [file], assignments: { matches: { R1: 'file' }, expiries: {} }, includeIndex: false, madeOn: '2026-10-06' });
  assert.equal(result.pageCount, 2);
});

test('expired provided optional documents cannot bypass PDF validation', async () => {
  const file = await sourceFile();
  const expiredData = { ...data, requirements: [{ ...requirement, mandatory: false, has_expiry: true }] };
  await assert.rejects(createTenderPackage({ data: expiredData, files: [file], assignments: { matches: { R1: 'file' }, expiries: { R1: '2026-10-19' } }, includeIndex: false, madeOn: '2026-10-06' }), /Resolve/);
});
