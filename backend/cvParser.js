const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

const DOCX_MIMETYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const LINKEDIN_RE = /linkedin\.com\/in\/[\w-]+/i;
const GITHUB_RE = /github\.com\/[\w-]+/i;

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

// Best-effort only: the candidate's name is usually (not always) the first
// non-empty line of a CV. Rejected if it looks like contact info instead, or
// isn't a plausible 2-4 word name - false negatives (returning null) are far
// preferable to false positives here, since the admin reviews/edits this
// before anything is saved.
function guessName(text) {
  const firstLine = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine || firstLine.length > 60) return null;
  if (EMAIL_RE.test(firstLine) || /https?:\/\//i.test(firstLine)) return null;
  const words = firstLine.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return null;
  return firstLine;
}

// Extracts raw CV text plus a small set of contact-adjacent fields that are
// reliably regex-matchable. Skills/experience/education/certifications are
// deliberately NOT guessed here - free-form CV prose can't be reliably
// parsed into structured fields without real NLP/AI, which is out of scope
// for this local-extraction-only approach. The full rawText is returned so
// the admin can read/copy from it while filling those fields manually.
async function extractCvFields(buffer, mimetype) {
  const rawText = await extractText(buffer, mimetype);

  const email = rawText.match(EMAIL_RE)?.[0] || null;
  const phone = rawText.match(PHONE_RE)?.[0]?.trim() || null;
  const linkedinMatch = rawText.match(LINKEDIN_RE)?.[0];
  const githubMatch = rawText.match(GITHUB_RE)?.[0];

  const nameGuess = guessName(rawText);
  let firstName = null;
  let lastName = null;
  if (nameGuess) {
    const parts = nameGuess.split(/\s+/);
    firstName = parts[0];
    lastName = parts.slice(1).join(' ');
  }

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
  };
}

module.exports = { extractCvFields, DOCX_MIMETYPE };
