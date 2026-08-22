// Builds a screenplay-formatted PDF directly from Project/Script data using
// pdfkit — not by rendering the app's DOM. webContents.printToPDF() only
// captures what fits the window's viewport rather than truly paginating,
// so this lays out every element by hand (same margins/indents as the
// on-screen CSS) with real page breaks.
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import type { ElementType, Project, Script } from '../src/model/types';

const PAGE_HEIGHT = 11 * 72;
const MARGIN_TOP = 1 * 72;
const MARGIN_BOTTOM = 1 * 72;
const MARGIN_LEFT = 1.5 * 72;
const MARGIN_RIGHT = 1 * 72;
const CONTENT_WIDTH_IN = 6; // 8.5 - 1.5 - 1
const LINE_HEIGHT = 12; // 6 lines/inch, standard screenplay pitch
const CHARS_PER_INCH = 10; // Courier 12pt is exactly 7.2pt/char = 10 cpi

interface Layout {
  leftIn: number;
  widthIn: number;
  align?: 'left' | 'right';
  bold?: boolean;
  upper?: boolean;
  blankBefore: number;
}

// Mirrors the on-screen margins in src/index.css (.el-scene, .el-character, etc).
const LAYOUT: Record<ElementType, Layout> = {
  scene: { leftIn: 0, widthIn: CONTENT_WIDTH_IN, bold: true, upper: true, blankBefore: 2 },
  action: { leftIn: 0, widthIn: CONTENT_WIDTH_IN, blankBefore: 1 },
  character: { leftIn: 2.2, widthIn: 3.3, upper: true, blankBefore: 1 },
  parenthetical: { leftIn: 1.6, widthIn: 2.5, blankBefore: 0 },
  dialogue: { leftIn: 1.0, widthIn: 3.5, blankBefore: 0 },
  transition: { leftIn: 0, widthIn: CONTENT_WIDTH_IN, align: 'right', upper: true, blankBefore: 1 },
};

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

function nextNonEmptyType(elements: Script['elements'], from: number): ElementType | null {
  for (let i = from + 1; i < elements.length; i++) {
    if (elements[i].text.trim()) return elements[i].type;
  }
  return null;
}

export function writeScreenplayPdf(
  project: Project,
  script: Script,
  filePath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT },
    });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);

    drawTitlePage(doc, project, script);
    doc.addPage();
    drawScript(doc, script);

    doc.end();
  });
}

function centered(doc: PDFKit.PDFDocument, text: string, y: number): void {
  doc.text(text, MARGIN_LEFT, y, { width: CONTENT_WIDTH_IN * 72, align: 'center' });
}

function drawTitlePage(doc: PDFKit.PDFDocument, project: Project, script: Script): void {
  const tp = project.titlePage;
  const title =
    project.kind === 'show' && script.name ? `${tp.title || project.name} — ${script.name}` : tp.title;

  let y = PAGE_HEIGHT * 0.35;
  if (title) {
    doc.font('Courier-Bold').fontSize(14);
    centered(doc, title.toUpperCase(), y);
    y += 40;
  }
  doc.font('Courier').fontSize(12);
  if (tp.credit) {
    centered(doc, tp.credit, y);
    y += 20;
  }
  if (tp.author) {
    centered(doc, tp.author, y);
    y += 20;
  }

  let by = PAGE_HEIGHT - MARGIN_BOTTOM - 60;
  if (tp.contact) {
    doc.text(tp.contact, MARGIN_LEFT, by, { width: 3 * 72 });
    by += 40;
  }
  if (tp.draftDate) {
    doc.text(tp.draftDate, MARGIN_LEFT, by, { width: 3 * 72 });
  }
}

function drawScript(doc: PDFKit.PDFDocument, script: Script): void {
  let y = MARGIN_TOP;

  function ensureRoom(lines: number): void {
    if (y + lines * LINE_HEIGHT > PAGE_HEIGHT - MARGIN_BOTTOM) {
      doc.addPage();
      y = MARGIN_TOP;
    }
  }

  script.elements.forEach((el, i) => {
    const text = el.text.trim();
    if (!text) return;

    const layout = LAYOUT[el.type];
    const displayText = layout.upper ? text.toUpperCase() : text;
    const maxChars = Math.max(1, Math.floor(layout.widthIn * CHARS_PER_INCH));
    const lines = wrapText(displayText, maxChars);
    const blank = i === 0 ? 0 : layout.blankBefore;

    // Avoid stranding a character cue at the bottom of a page with no
    // room for the dialogue that follows it.
    const next = nextNonEmptyType(script.elements, i);
    const needsFollowUp = el.type === 'character' && (next === 'dialogue' || next === 'parenthetical');
    ensureRoom(blank + lines.length + (needsFollowUp ? 1 : 0));

    y += blank * LINE_HEIGHT;
    doc.font(layout.bold ? 'Courier-Bold' : 'Courier').fontSize(12);
    const x = MARGIN_LEFT + layout.leftIn * 72;
    const width = layout.widthIn * 72;

    for (const line of lines) {
      ensureRoom(1);
      doc.text(line, x, y, { width, align: layout.align ?? 'left', lineBreak: false });
      y += LINE_HEIGHT;
    }
  });
}
