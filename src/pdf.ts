import { PDFDocument, PageSizes, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from 'pdf-lib';
import type { AssignmentState, Requirement, RequirementsData, UploadedPdf } from './engine';
import { canAssignFile, getRequirementStatus, isBlockingStatus } from './engine.ts';
import 'regenerator-runtime/runtime.js';

interface PackageOptions {
  data: RequirementsData;
  files: UploadedPdf[];
  assignments: AssignmentState;
  includeIndex: boolean;
  madeOn: string;
}

export interface PackageResult {
  bytes: Uint8Array;
  pageCount: number;
  fileName: string;
}

const A4_WIDTH = PageSizes.A4[0];
const A4_HEIGHT = PageSizes.A4[1];
const FOOTER_HEIGHT = 38;

function fitText(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  const characters = Array.from(text);
  while (characters.length && font.widthOfTextAtSize(characters.join('') + '...', size) > width) characters.pop();
  return characters.join('') + '...';
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines;
}

function drawWrapped(
  page: PDFPage,
  text: string,
  options: { x: number; y: number; width: number; size: number; lineHeight: number; font: PDFFont; color?: ReturnType<typeof rgb> },
): number {
  const lines = wrapText(text, options.font, options.size, options.width);
  lines.forEach((line, index) => page.drawText(line, {
    x: options.x,
    y: options.y - index * options.lineHeight,
    size: options.size,
    font: options.font,
    color: options.color ?? rgb(0.08, 0.12, 0.11),
  }));
  return options.y - lines.length * options.lineHeight;
}

function includedRequirements(
  requirements: Requirement[],
  files: UploadedPdf[],
  matches: AssignmentState['matches'],
): Array<{ requirement: Requirement; file: UploadedPdf }> {
  return requirements
    .slice().sort((a, b) => a.order - b.order)
    .map((requirement) => ({ requirement, file: files.find((file) => file.id === matches[requirement.id]) }))
    .filter((item): item is { requirement: Requirement; file: UploadedPdf } => Boolean(item.file));
}

function drawLabelValue(page: PDFPage, label: string, value: string, y: number, regular: PDFFont, bold: PDFFont): number {
  page.drawText(label.toUpperCase(), { x: 58, y, size: 8, font: bold, color: rgb(0.36, 0.43, 0.4) });
  return drawWrapped(page, value, { x: 180, y: y - 1, width: 350, size: 11, lineHeight: 14, font: regular });
}

function drawCover(
  pdf: PDFDocument,
  data: RequirementsData,
  included: Array<{ requirement: Requirement; file: UploadedPdf }>,
  madeOn: string,
  regular: PDFFont,
  bold: PDFFont,
): PDFPage {
  const page = pdf.addPage(PageSizes.A4);
  page.drawRectangle({ x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT, color: rgb(0.965, 0.952, 0.91) });
  page.drawRectangle({ x: 0, y: A4_HEIGHT - 18, width: A4_WIDTH, height: 18, color: rgb(0.07, 0.29, 0.25) });
  page.drawCircle({ x: 512, y: 725, size: 58, color: rgb(0.87, 0.91, 0.73), opacity: 0.7 });
  page.drawText('N O T H I S E T U', { x: 58, y: 756, size: 9, font: bold, color: rgb(0.07, 0.29, 0.25) });
  page.drawText('TENDER DOCUMENT PACKAGE', { x: 58, y: 704, size: 10, font: bold, color: rgb(0.78, 0.39, 0.08) });
  let y = drawWrapped(page, data.tender.title, { x: 58, y: 666, width: 450, size: 28, lineHeight: 32, font: bold, color: rgb(0.06, 0.21, 0.19) });
  page.drawText(data.tender.tender_id, { x: 58, y: y - 4, size: 13, font: regular, color: rgb(0.3, 0.38, 0.35) });
  page.drawLine({ start: { x: 58, y: y - 30 }, end: { x: 537, y: y - 30 }, thickness: 1, color: rgb(0.75, 0.76, 0.68) });
  y -= 58;
  y = drawLabelValue(page, 'Procuring entity', data.tender.procuring_entity, y, regular, bold) - 12;
  y = drawLabelValue(page, 'Bidder', data.tender.bidder, y, regular, bold) - 12;
  y = drawLabelValue(page, 'Submission deadline', data.tender.submission_deadline, y, regular, bold) - 12;
  y = drawLabelValue(page, 'Package made', madeOn, y, regular, bold) - 24;
  page.drawText('I N C L U D E D   D O C U M E N T S', { x: 58, y, size: 8, font: bold, color: rgb(0.36, 0.43, 0.4) });
  y -= 24;
  const listSize = included.length > 22 ? 8.5 : included.length > 15 ? 9.5 : 10.5;
  const lineHeight = listSize + 5;
  included.forEach(({ requirement, file }, index) => {
    page.drawCircle({ x: 65, y: y + 3, size: 8, color: rgb(0.07, 0.29, 0.25) });
    const number = String(index + 1);
    const numberWidth = bold.widthOfTextAtSize(number, 7);
    page.drawText(number, { x: 65 - numberWidth / 2, y, size: 7, font: bold, color: rgb(1, 1, 1) });
    page.drawText(fitText(requirement.title_en, bold, listSize, 205), { x: 83, y, size: listSize, font: bold, color: rgb(0.08, 0.15, 0.13) });
    const fileLabel = fitText(file.name, regular, 8, 191);
    page.drawText(`${file.pages} page${file.pages === 1 ? '' : 's'} · ${fileLabel}`, { x: 300, y, size: 8, font: regular, color: rgb(0.42, 0.47, 0.44) });
    y -= lineHeight;
  });
  return page;
}

function drawIndex(
  pdf: PDFDocument,
  data: RequirementsData,
  included: Array<{ requirement: Requirement; file: UploadedPdf }>,
  regular: PDFFont,
  bold: PDFFont,
): PDFPage {
  const page = pdf.addPage(PageSizes.A4);
  page.drawRectangle({ x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT, color: rgb(0.985, 0.98, 0.96) });
  page.drawText('Package index', { x: 58, y: 746, size: 26, font: bold, color: rgb(0.06, 0.21, 0.19) });
  page.drawText(`${data.tender.tender_id} · ${included.length} included documents`, { x: 58, y: 718, size: 10, font: regular, color: rgb(0.38, 0.44, 0.41) });
  page.drawLine({ start: { x: 58, y: 696 }, end: { x: 537, y: 696 }, thickness: 1, color: rgb(0.76, 0.78, 0.72) });
  let y = 665;
  let startPage = 3;
  included.forEach(({ requirement, file }, index) => {
    page.drawText(String(index + 1).padStart(2, '0'), { x: 58, y, size: 10, font: bold, color: rgb(0.78, 0.39, 0.08) });
    page.drawText(fitText(requirement.title_en, bold, 10.5, 340), { x: 94, y, size: 10.5, font: bold, color: rgb(0.09, 0.16, 0.14) });
    const pageLabel = `Page ${startPage}`;
    page.drawText(pageLabel, { x: 520 - regular.widthOfTextAtSize(pageLabel, 9), y, size: 9, font: regular, color: rgb(0.34, 0.4, 0.37) });
    page.drawLine({ start: { x: 94, y: y - 7 }, end: { x: 520, y: y - 7 }, thickness: 0.35, color: rgb(0.85, 0.85, 0.8) });
    y -= 20;
    startPage += file.pages;
  });
  return page;
}

export async function createTenderPackage(options: PackageOptions): Promise<PackageResult> {
  const { data, files, assignments, includeIndex, madeOn } = options;
  for (const requirement of data.requirements) {
    const fileId = assignments.matches[requirement.id];
    if (isBlockingStatus(getRequirementStatus(requirement, fileId, assignments.expiries[requirement.id], data.tender.submission_deadline))) {
      throw new Error(`Resolve this document before exporting: ${requirement.title_en}`);
    }
    if (fileId && !canAssignFile(requirement.id, fileId, files, assignments.matches)) {
      throw new Error(`Missing or duplicate document: ${requirement.title_en}`);
    }
  }
  const included = includedRequirements(data.requirements, files, assignments.matches);
  const output = await PDFDocument.create();
  output.setTitle(`${data.tender.tender_id} Tender Package`);
  output.setAuthor(data.tender.bidder);
  output.setCreator('NothiSetu Tender Package Studio');
  output.setProducer('NothiSetu · pdf-lib');
  output.setCreationDate(new Date());
  const textValues = [...Object.values(data.tender), ...included.flatMap(({ requirement, file }) => [requirement.title_en, file.name])];
  let regular: PDFFont;
  let bold: PDFFont;
  if (textValues.some((text) => /[^\x20-\x7E\u00A0-\u00FF]/.test(text))) {
    const [{ default: fontkit }, fontBytes] = await Promise.all([
      import('@pdf-lib/fontkit'),
      Promise.all(['Regular', 'Bold'].map(async (weight) => {
        const response = await fetch(`/fonts/HindSiliguri-${weight}.ttf`);
        if (!response.ok) throw new Error('Could not load the local Bengali font. Please retry.');
        return response.arrayBuffer();
      })),
    ]);
    output.registerFontkit(fontkit);
    [regular, bold] = await Promise.all(fontBytes.map((bytes) => output.embedFont(bytes, { subset: true })));
  } else {
    [regular, bold] = await Promise.all([output.embedFont(StandardFonts.Helvetica), output.embedFont(StandardFonts.HelveticaBold)]);
  }

  drawCover(output, data, included, madeOn, regular, bold);
  if (includeIndex) drawIndex(output, data, included, regular, bold);

  for (const { file } of included) {
    const source = await PDFDocument.load(file.bytes, { updateMetadata: false });
    // Flatten visible form fields into the source appearance before embedding pages.
    if (source.getForm().getFields().length) source.getForm().flatten();
    for (const sourcePage of source.getPages()) {
      const rotation = ((sourcePage.getRotation().angle % 360) + 360) % 360;
      const swapped = rotation === 90 || rotation === 270;
      // A blank separator page may have no Contents stream at all.
      if (!sourcePage.node.Contents()) sourcePage.drawRectangle({ x: 0, y: 0, width: sourcePage.getWidth(), height: sourcePage.getHeight(), color: rgb(1, 1, 1) });
      const embedded = await output.embedPage(sourcePage);
      const width = swapped ? embedded.height : embedded.width;
      const height = swapped ? embedded.width : embedded.height;
      const page = output.addPage([width, height + FOOTER_HEIGHT]);
      page.drawRectangle({ x: 0, y: 0, width, height: FOOTER_HEIGHT, color: rgb(1, 1, 1) });
      const x = rotation === 180 ? embedded.width : rotation === 270 ? embedded.height : 0;
      const y = FOOTER_HEIGHT + (rotation === 90 ? embedded.width : rotation === 180 ? embedded.height : 0);
      page.drawPage(embedded, { x, y, width: embedded.width, height: embedded.height, rotate: degrees(-rotation) });
    }
  }

  const pages = output.getPages();
  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const footer = `${data.tender.tender_id} | Page ${index + 1} of ${pages.length}`;
    const footerWidth = regular.widthOfTextAtSize(footer, 9);
    page.drawLine({ start: { x: 26, y: 31 }, end: { x: width - 26, y: 31 }, thickness: 0.5, color: rgb(0.72, 0.75, 0.72) });
    page.drawText(footer, { x: (width - footerWidth) / 2, y: 15, size: 9, font: regular, color: rgb(0.24, 0.31, 0.29) });
  });

  const bytes = await output.save();
  return { bytes, pageCount: pages.length, fileName: `${data.tender.tender_id.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')}_Package.pdf` };
}

