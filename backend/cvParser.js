const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

const DOCX_MIMETYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
// Global variant for scanning every candidate match (see extractPhone) - a
// separate regex object, not PHONE_RE with a 'g' flag added, since a global
// regex's stateful lastIndex would otherwise corrupt PHONE_RE.test() calls
// elsewhere (looksLikeNameLine).
const PHONE_CANDIDATES_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const LINKEDIN_RE = /linkedin\.com\/in\/[\w-]+/i;
const GITHUB_RE = /github\.com\/[\w-]+/i;

// A minimum real-phone-number digit count - filters out date ranges and
// other loosely-shaped matches ("2020-2023" has only 8 digits) that
// otherwise satisfy PHONE_RE's shape but aren't phone numbers.
const MIN_PHONE_DIGITS = 9;

// Scans every PHONE_RE-shaped match in the text and returns the first one
// with enough digits to plausibly be a real phone number, along with its
// position (for the low-confidence-if-found-deep-in-the-document check).
function extractPhone(text) {
  for (const m of text.matchAll(PHONE_CANDIDATES_RE)) {
    const digitCount = (m[0].match(/\d/g) || []).length;
    if (digitCount >= MIN_PHONE_DIGITS) return { value: m[0].trim(), index: m.index };
  }
  return null;
}

// Contact info reliably lives near the top of a CV; a regex match found
// deep in the body is far more likely to be a stray phone-shaped number in
// a project description or a colleague's email in a reference letter than
// the candidate's own - not wrong often enough to discard, but worth
// flagging so the admin double-checks instead of trusting it blindly.
const TOP_OF_DOCUMENT_CHARS = 400;

// A document title/header ("Curriculum Vitae", "CV", "Profil") is often
// exactly 2 words and would otherwise pass the name-shape check with false
// confidence - reject these explicitly so the real name (usually the next
// candidate line) gets found instead, even if that means falling through
// to the lower-confidence scan.
const NAME_STOPWORD_RE = /\b(curriculum|vitae|r[ée]sum[ée]|cv|profil|profile)\b/i;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function extractText(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText({ pageJoiner: '' });
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  if (mimetype === DOCX_MIMETYPE) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  const err = new Error('UNSUPPORTED_MIMETYPE');
  err.code = 'UNSUPPORTED_MIMETYPE';
  throw err;
}

// A line that could plausibly be a person's name: short, no contact-info
// shape, 2-4 words.
function looksLikeNameLine(line) {
  if (!line || line.length > 60) return false;
  if (EMAIL_RE.test(line) || /https?:\/\//i.test(line) || PHONE_RE.test(line)) return false;
  if (NAME_STOPWORD_RE.test(line)) return false;
  const words = line.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 4;
}

// Best-effort only: the candidate's name is usually (not always) the first
// non-empty line of a CV. The strict case - first line matches the
// name-shape check - is returned with full confidence. If that fails (a
// document title, logo caption, or "Curriculum Vitae" header sits above the
// real name), a looser fallback scans the next few lines for the same
// shape and returns it flagged lowConfidence so the admin double-checks
// rather than trusting it silently. Returning null (no guess at all) stays
// preferable to a confident-looking wrong guess when nothing in the first
// few lines fits.
function guessNameWithConfidence(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6);
  if (lines.length === 0) return null;
  if (looksLikeNameLine(lines[0])) return { value: lines[0], lowConfidence: false };
  const fallback = lines.slice(1).find(looksLikeNameLine);
  return fallback ? { value: fallback, lowConfidence: true } : null;
}

// Extracts raw CV text plus a small set of contact-adjacent fields that are
// reliably regex-matchable, and flags known SAP modules/certification names
// found anywhere in the text as suggestions. Skills/experience/education
// aren't otherwise guessed - free-form CV prose can't be reliably parsed
// into structured fields without real NLP/AI, which is out of scope for
// this local-extraction-only approach (same keyword-matching-against-known-
// referentials precedent as rfpExtractor.js). The full rawText is returned
// so the admin can read/copy from it while filling the rest manually.
//
// sapModules: [{code}], certificationNames: [string] - passed in so this
// stays a pure function over referential data rather than querying the DB
// itself (same convention as extractRfpFields).
async function extractCvFields(buffer, mimetype, { sapModules = [], certificationNames = [] } = {}) {
  const rawText = await extractText(buffer, mimetype);

  const emailMatch = rawText.match(EMAIL_RE);
  const phoneMatch = extractPhone(rawText);
  const email = emailMatch?.[0] || null;
  const phone = phoneMatch?.value || null;
  const linkedinMatch = rawText.match(LINKEDIN_RE)?.[0];
  const githubMatch = rawText.match(GITHUB_RE)?.[0];

  const nameGuess = guessNameWithConfidence(rawText);
  let firstName = null;
  let lastName = null;
  if (nameGuess) {
    const parts = nameGuess.value.split(/\s+/);
    firstName = parts[0];
    lastName = parts.slice(1).join(' ');
  }

  const detectedModules = sapModules
    .filter((m) => new RegExp(`\\b${escapeRegex(m.code)}\\b`, 'i').test(rawText))
    .map((m) => m.code);
  const detectedCertifications = certificationNames.filter((name) =>
    rawText.toLowerCase().includes(name.toLowerCase())
  );

  return {
    rawText,
    guessedFields: {
      firstName,
      lastName,
      email,
      phone,
      linkedinUrl: linkedinMatch ? `https://${linkedinMatch}` : null,
      portfolioUrl: githubMatch ? `https://${githubMatch}` : null,
    },
    // UI-only hints - never block or auto-correct anything, just tell the
    // admin which pre-filled fields are worth a second look.
    lowConfidence: {
      name: nameGuess?.lowConfidence || false,
      email: email ? emailMatch.index > TOP_OF_DOCUMENT_CHARS : false,
      phone: phone ? phoneMatch.index > TOP_OF_DOCUMENT_CHARS : false,
    },
    // Suggestions only, presented as "détecté(s) dans le CV, à confirmer" -
    // never auto-applied to the candidate's skills/certifications.
    detectedModules,
    detectedCertifications,
  };
}

module.exports = { extractCvFields, DOCX_MIMETYPE };
