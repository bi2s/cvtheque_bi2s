// Rule/keyword-based cahier-des-charges extraction - same approach as
// cvParser.js, extended with an Excel path. Deliberately not a real LLM (the
// no-AI decision this session made): finds what it reliably can (known SAP
// modules/certifications, date patterns, a budget figure, recognizable
// section headings) and leaves the rest honestly empty for the commercial
// user to fill in at the wizard's validation step - a cahier des charges is
// long, unstructured business prose without the CV's reliable anchors, so
// this extraction is a starting point, not a complete read.
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

const DOCX_MIMETYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIMETYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

const DATE_RE = /\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g;
const BUDGET_RE = /\b\d[\d\s.,]{2,}\s?(€|EUR|DZD|DA)\b/gi;

// Best-effort paragraph bucketing under known section-heading keywords -
// silently skipped (left empty) when the source document doesn't use
// recognizable headings, never guessed.
const SECTION_HEADINGS = {
  objectives: /objectifs?/i,
  functionalNeeds: /besoins?\s+fonctionnels?/i,
  deliverables: /livrables?/i,
  evaluationCriteria: /crit[eè]res?\s+d.[ée]valuation/i,
  timeline: /planning|calendrier|d[ée]lais?/i,
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function extractText(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText({ pageJoiner: '\n' });
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  if (mimetype === DOCX_MIMETYPE) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (XLSX_MIMETYPES.includes(mimetype)) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const parts = [];
    for (const sheetName of workbook.SheetNames) {
      parts.push(`--- ${sheetName} ---`);
      parts.push(XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]));
    }
    return parts.join('\n');
  }
  const err = new Error('UNSUPPORTED_MIMETYPE');
  err.code = 'UNSUPPORTED_MIMETYPE';
  throw err;
}

// A real heading is short and terse (no sentence punctuation); a keyword
// merely appearing inside a body sentence (e.g. "...délais de mise en
// oeuvre.") must not be mistaken for a section break.
function looksLikeHeading(line) {
  return line.length < 60 && !/[.,;:]/.test(line);
}

function extractSections(text) {
  const sections = {};
  let currentKey = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const headingKey = looksLikeHeading(line)
      ? Object.entries(SECTION_HEADINGS).find(([, re]) => re.test(line))?.[0]
      : undefined;
    if (headingKey) {
      currentKey = headingKey;
      if (!sections[currentKey]) sections[currentKey] = [];
      continue;
    }
    if (currentKey) sections[currentKey].push(line);
  }
  return Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.join(' ').slice(0, 2000)]));
}

// sapModules: [{code}], certificationNames: [string] - passed in so the
// extractor stays a pure function over referential data rather than
// querying the DB itself.
async function extractRfpFields(buffer, mimetype, { sapModules = [], certificationNames = [] } = {}) {
  const rawText = await extractText(buffer, mimetype);

  const detectedModules = sapModules
    .filter((m) => new RegExp(`\\b${escapeRegex(m.code)}\\b`, 'i').test(rawText))
    .map((m) => m.code);
  const detectedCertifications = certificationNames.filter((name) => rawText.toLowerCase().includes(name.toLowerCase()));
  const dates = [...new Set((rawText.match(DATE_RE) || []).slice(0, 20))];
  const budget = rawText.match(BUDGET_RE)?.[0]?.trim() || null;
  const sections = extractSections(rawText);

  return {
    rawText,
    extracted: { detectedModules, detectedCertifications, dates, budget, sections },
  };
}

module.exports = { extractRfpFields, DOCX_MIMETYPE, XLSX_MIMETYPES };
