const pptxgen = require('pptxgenjs');
const path = require('path');

// Mirrors frontend-react/src/genderize.js - kept as a small duplicate
// rather than a shared module since frontend/backend have no shared JS
// package in this app (same tradeoff already accepted for the Role-line
// fallback logic itself, which is also duplicated between CvPreview.jsx and
// this file).
const ROLE_FEMININE_FORMS = {
  'Consultant Fonctionnel': 'Consultante Fonctionnelle',
  'Consultant Technique': 'Consultante Technique',
  'Consultant SD': 'Consultante SD',
  'Consultant MM': 'Consultante MM',
  'Consultant FI': 'Consultante FI',
  'Consultant CO': 'Consultante CO',
  'Consultant PP': 'Consultante PP',
  'Consultant QM': 'Consultante QM',
  'Consultant PM': 'Consultante PM',
  'Consultant EWM': 'Consultante EWM',
  'Consultant TM': 'Consultante TM',
  'Consultant SuccessFactors': 'Consultante SuccessFactors',
  'Consultant Ariba': 'Consultante Ariba',
  'Développeur ABAP': 'Développeuse ABAP',
  'Développeur Fiori/UI5': 'Développeuse Fiori/UI5',
  'Chef de Projet': 'Cheffe de Projet',
  Formateur: 'Formatrice',
  'Expert Métier': 'Experte Métier',
};

function genderizeRoleLabel(label, gender) {
  if (gender !== 'F' || !label) return label;
  return ROLE_FEMININE_FORMS[label] || label;
}

function genderedConsultantLabel(gender) {
  if (gender === 'F') return 'Consultante';
  if (gender === 'M') return 'Consultant';
  return 'Consultant(e)';
}

const ASSETS = path.join(__dirname, 'assets');
const GRADIENT_BG = path.join(ASSETS, 'gradient-bg.png');
const SWOOSH_LINES = path.join(ASSETS, 'swoosh-lines.png');
const LOCKUP_WHITE = path.join(ASSETS, 'lockup-white.png');
const LOCKUP_COLOR = path.join(ASSETS, 'lockup-color.png');
const LOCKUP_RATIO = 436 / 840; // height/width of the rendered lockup PNG

const COLOR = {
  charbon: '1B1D1E',
  turquoise: '2FEA99',
  menthe: 'E8F4EE',
  gris: '5A6360',
  navy: '12455E',
  white: 'FFFFFF',
  pill: 'DCF6EA',
  border: 'E3E8E6',
};

const FONT = 'Arial';
const STAGE_ORDER = ['Explore', 'Realize', 'Deploy', 'Run'];
const SKILL_SECTIONS = [
  { category: 'module', title: 'MODULES SAP S/4HANA' },
  { category: 'flow', title: 'FLUX DE BOUT EN BOUT' },
  { category: 'technology', title: 'TECHNOLOGIES' },
  { category: 'methodology', title: 'MÉTHODOLOGIES & OUTILS' },
];
const TRANSVERSAL_SKILLS = [
  "Animation d'ateliers métier (Fit-to-Standard, cadrage, conception)",
  'Rédaction : BBP, spécifications fonctionnelles, PV de recette',
  'Formation des Key Users & conduite du changement',
  'Coordination de parties prenantes multi-projets',
];
const CONTACT_EMAIL = 'contact@b-i2s.com';

function addLockup(slide) {
  slide.addImage({ path: LOCKUP_COLOR, x: 10.3, y: 0.35, w: 2.3, h: 2.3 * LOCKUP_RATIO });
}

function addCard(slide, { x, y, w, h, fill = COLOR.white, line }) {
  slide.addShape('roundRect', {
    x,
    y,
    w,
    h,
    rectRadius: 0.04,
    fill: { color: fill },
    line: line || { color: COLOR.border, width: 1 },
  });
}

function addPill(slide, label, { x, y, w, h = 0.32, fill, textColor = COLOR.charbon, fontSize = 9, bold = false }) {
  slide.addText(label, {
    x,
    y,
    w,
    h,
    shape: 'roundRect',
    rectRadius: 0.5,
    fill: { color: fill },
    line: { type: 'none' },
    color: textColor,
    fontFace: FONT,
    fontSize,
    bold,
    align: 'center',
    valign: 'middle',
    margin: 0,
  });
}

// Lays out a wrapping row of pills starting at (x,y) within maxW; returns the y coordinate below the row(s).
function addPillRow(slide, labels, { x, y, maxW, starredLabel, fontSize = 9 }) {
  const h = fontSize > 8 ? 0.32 : 0.26;
  const gap = 0.08;
  let cx = x;
  let cy = y;
  for (const label of labels) {
    const w = Math.min(maxW, 0.3 + label.length * 0.075);
    if (cx !== x && cx + w > x + maxW) {
      cx = x;
      cy += h + gap;
    }
    const starred = label === starredLabel;
    addPill(slide, label, {
      x: cx,
      y: cy,
      w,
      h,
      fill: starred ? COLOR.charbon : COLOR.pill,
      textColor: starred ? COLOR.turquoise : COLOR.charbon,
      fontSize,
      bold: starred,
    });
    cx += w + gap;
  }
  return cy + h;
}

function addStageBadges(slide, tags, x, y) {
  let cx = x;
  const h = 0.26;
  for (const tag of STAGE_ORDER) {
    if (!tags.includes(tag)) continue;
    const w = 0.85;
    addPill(slide, tag, { x: cx, y, w, h, fill: COLOR.navy, textColor: COLOR.white, fontSize: 8, bold: true });
    cx += w + 0.08;
  }
}

function addFooter(slide, data, pageNum) {
  slide.addText(`${data.name} — Dossier de compétences SAP S/4HANA`, {
    x: 0.6,
    y: 7.15,
    w: 7,
    h: 0.3,
    fontFace: FONT,
    fontSize: 8,
    color: COLOR.gris,
  });
  slide.addText(`Bi2S — Best IS Solutions · ${pageNum}`, {
    x: 10,
    y: 7.15,
    w: 2.7,
    h: 0.3,
    fontFace: FONT,
    fontSize: 8,
    color: COLOR.gris,
    align: 'right',
  });
}

function primaryModuleLabel(data) {
  const starred = data.skills.find((s) => s.category === 'module' && s.starred);
  if (starred) return starred.label;
  const firstModule = data.skills.find((s) => s.category === 'module');
  if (firstModule) return firstModule.label;
  return data.projects[0]?.modules?.[0] || null;
}

function addTitleSlide(pres, data, photoPath) {
  const slide = pres.addSlide();
  slide.addImage({ path: GRADIENT_BG, x: 0, y: 0, w: 13.33, h: 7.5 });
  slide.addImage({ path: SWOOSH_LINES, x: 0, y: 0, w: 13.33, h: 7.5 });
  const logoH = 0.72;
  slide.addImage({ path: LOCKUP_WHITE, x: 0.7, y: 0.5, w: logoH / LOCKUP_RATIO, h: logoH });

  const module = primaryModuleLabel(data);
  const subtitle = module ? `SAP S/4HANA · ${module}` : 'SAP S/4HANA';

  slide.addText('CURRICULUM VITÆ', {
    x: 0.7,
    y: 2.0,
    w: 9,
    h: 0.55,
    fontFace: FONT,
    fontSize: 30,
    bold: true,
    color: COLOR.white,
  });
  slide.addText(data.name.toUpperCase(), {
    x: 0.7,
    y: 2.5,
    w: 9,
    h: 0.75,
    fontFace: FONT,
    fontSize: 30,
    bold: true,
    color: COLOR.white,
  });
  slide.addText(
    [
      { text: `${data.name} — ${genderedConsultantLabel(data.gender)}`, options: { breakLine: true } },
      { text: subtitle, options: {} },
    ],
    { x: 0.7, y: 3.55, w: 8, h: 0.8, fontFace: FONT, fontSize: 15, color: COLOR.white }
  );

  const monthYear = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const monthYearCapitalized = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
  slide.addText(`${monthYearCapitalized} · Bi2S — Best IS Solutions`, {
    x: 0.7,
    y: 6.6,
    w: 8,
    h: 0.4,
    fontFace: FONT,
    fontSize: 11,
    color: COLOR.white,
  });

  if (photoPath) {
    slide.addImage({ path: photoPath, x: 10.4, y: 4.9, w: 1.9, h: 1.9, rounding: true });
  }
}

function addProfileSlide(pres, data, pageNum) {
  const slide = pres.addSlide();
  slide.background = { color: COLOR.white };
  addLockup(slide);

  slide.addText('PROFIL & COMPÉTENCES CLÉS', {
    x: 0.6,
    y: 0.4,
    w: 8,
    h: 0.5,
    fontFace: FONT,
    fontSize: 20,
    bold: true,
    color: COLOR.charbon,
  });

  addCard(slide, { x: 0.6, y: 1.1, w: 5.7, h: 2.55, fill: COLOR.menthe, line: { color: COLOR.menthe } });
  slide.addText('PROFIL', {
    x: 0.85,
    y: 1.28,
    w: 4,
    h: 0.3,
    fontFace: FONT,
    fontSize: 10,
    bold: true,
    color: COLOR.gris,
  });
  slide.addText(data.profileSummary || 'Profil non renseigné.', {
    x: 0.85,
    y: 1.6,
    w: 5.2,
    h: 1.9,
    fontFace: FONT,
    fontSize: 11,
    color: COLOR.charbon,
    valign: 'top',
  });

  addCard(slide, { x: 0.6, y: 3.85, w: 5.7, h: 1.5, line: { color: COLOR.turquoise, width: 1 } });
  slide.addText('LANGUES', {
    x: 0.85,
    y: 4.0,
    w: 4,
    h: 0.3,
    fontFace: FONT,
    fontSize: 10,
    bold: true,
    color: COLOR.gris,
  });
  let langY = 4.35;
  if (data.languages.length === 0) {
    slide.addText('Non renseigné', { x: 0.85, y: langY, w: 4.8, h: 0.3, fontFace: FONT, fontSize: 10, color: COLOR.gris });
  } else {
    for (const l of data.languages.slice(0, 3)) {
      slide.addText(
        [
          { text: `${l.name}   `, options: { bold: true } },
          { text: l.level, options: { color: '127A55' } },
        ],
        { x: 0.85, y: langY, w: 4.8, h: 0.3, fontFace: FONT, fontSize: 10.5, color: COLOR.charbon }
      );
      langY += 0.32;
    }
  }

  const sectW = 2.95;
  const sectH = 1.5;
  const positions = [
    { x: 6.55, y: 1.1 },
    { x: 9.75, y: 1.1 },
    { x: 6.55, y: 2.75 },
    { x: 9.75, y: 2.75 },
  ];
  SKILL_SECTIONS.forEach((sec, i) => {
    const pos = positions[i];
    addCard(slide, { x: pos.x, y: pos.y, w: sectW, h: sectH });
    slide.addText(sec.title, {
      x: pos.x + 0.18,
      y: pos.y + 0.12,
      w: sectW - 0.36,
      h: 0.4,
      fontFace: FONT,
      fontSize: 8.5,
      bold: true,
      color: COLOR.gris,
    });
    const items = data.skills.filter((s) => s.category === sec.category);
    if (items.length === 0) {
      slide.addText('—', {
        x: pos.x + 0.18,
        y: pos.y + 0.55,
        w: sectW - 0.36,
        h: 0.3,
        fontFace: FONT,
        fontSize: 9,
        color: COLOR.gris,
      });
    } else {
      const starred = items.find((s) => s.starred)?.label;
      addPillRow(slide, items.map((s) => s.label), {
        x: pos.x + 0.18,
        y: pos.y + 0.5,
        maxW: sectW - 0.36,
        starredLabel: starred,
        fontSize: 7.5,
      });
    }
  });

  addFooter(slide, data, pageNum);
}

function addExperienceSlides(pres, data, startPage) {
  const projects = data.projects;
  if (projects.length === 0) return 0;
  const ownModuleLabels = (data.skills || []).filter((s) => s.category === 'module').map((s) => s.label);
  const chunks = [];
  for (let i = 0; i < projects.length; i += 3) chunks.push(projects.slice(i, i + 3));

  chunks.forEach((chunk, idx) => {
    const slide = pres.addSlide();
    slide.background = { color: COLOR.white };
    addLockup(slide);

    const title =
      chunks.length > 1
        ? `EXPÉRIENCES PROFESSIONNELLES (${idx + 1}/${chunks.length})`
        : 'EXPÉRIENCES PROFESSIONNELLES';
    slide.addText(title, {
      x: 0.6,
      y: 0.4,
      w: 9,
      h: 0.5,
      fontFace: FONT,
      fontSize: 18,
      bold: true,
      color: COLOR.charbon,
    });

    const cardW = 3.95;
    const cardH = 5.7;
    const gap = 0.2;
    const top = 1.1;

    chunk.forEach((proj, i) => {
      const x = 0.55 + i * (cardW + gap);
      addCard(slide, { x, y: top, w: cardW, h: cardH, fill: COLOR.menthe, line: { color: COLOR.menthe } });

      slide.addText(proj.client || 'Client', {
        x: x + 0.2,
        y: top + 0.18,
        w: cardW - 0.4,
        h: 0.55,
        fontFace: FONT,
        fontSize: 12.5,
        bold: true,
        color: COLOR.charbon,
        valign: 'top',
      });
      slide.addText((proj.modules || []).join(' · ') || proj.missionType || '', {
        x: x + 0.2,
        y: top + 0.68,
        w: cardW - 0.4,
        h: 0.3,
        fontFace: FONT,
        fontSize: 8.5,
        color: COLOR.gris,
      });

      let cy = top + 1.05;
      {
        // Same fallback as CvPreview.jsx: older assignments predating the
        // structured-role flow have no roleLabel, but should still show a
        // Rôle line rather than silently omitting it. Uses the consultant's
        // OWN module skills, not proj.modules (the project's full module
        // list, already shown just above) - a consultant staffed as
        // SD-only shouldn't have the Rôle line claim the whole project's
        // module set.
        const roleText = proj.roleLabel
          ? genderizeRoleLabel(proj.roleLabel, data.gender) + (proj.experienceLevel ? ` — ${proj.experienceLevel}` : '')
          : `${genderedConsultantLabel(data.gender)}${ownModuleLabels.length ? ` ${ownModuleLabels.join(', ')}` : ''}`;
        slide.addText(
          [
            { text: 'RÔLE  ', options: { bold: true, color: COLOR.charbon } },
            { text: roleText, options: {} },
          ],
          { x: x + 0.2, y: cy, w: cardW - 0.4, h: 0.3, fontFace: FONT, fontSize: 8, color: COLOR.gris, valign: 'top' }
        );
        cy += 0.3;
      }
      if (proj.description) {
        slide.addText(
          [
            { text: 'CONTEXTE  ', options: { bold: true, color: COLOR.charbon } },
            { text: proj.description, options: {} },
          ],
          { x: x + 0.2, y: cy, w: cardW - 0.4, h: 0.95, fontFace: FONT, fontSize: 8, color: COLOR.gris, valign: 'top' }
        );
        cy += 1.0;
      }

      // Prefer the richer experiencePhases (structured entry, variable-length
      // labels - needs the wrap-aware addPillRow, not the fixed-width
      // addStageBadges) when present; fall back to the legacy 4-value
      // stageTags for assignments submitted before that flow existed.
      if (proj.experiencePhases && proj.experiencePhases.length) {
        cy = addPillRow(slide, proj.experiencePhases, { x: x + 0.2, y: cy, maxW: cardW - 0.4, fontSize: 7.5 });
        cy += 0.08;
      } else if (proj.missionType === 'Intégration' && proj.stageTags && proj.stageTags.length) {
        addStageBadges(slide, proj.stageTags, x + 0.2, cy);
        cy += 0.38;
      }

      const points = (proj.rolePoints || []).slice(0, 6);
      const bulletAreaH = top + cardH - 0.3 - cy;
      if (points.length) {
        slide.addText(
          points.map((pt) => ({ text: pt, options: { bullet: { code: '25AA' }, breakLine: true } })),
          {
            x: x + 0.2,
            y: cy,
            w: cardW - 0.4,
            h: Math.max(bulletAreaH, 0.3),
            fontFace: FONT,
            fontSize: 8.5,
            color: COLOR.charbon,
            valign: 'top',
          }
        );
      }
    });

    addFooter(slide, data, startPage + idx);
  });

  return chunks.length;
}

function addFormationSlide(pres, data, pageNum) {
  const slide = pres.addSlide();
  slide.background = { color: COLOR.white };
  addLockup(slide);

  slide.addText('FORMATION & CERTIFICATION', {
    x: 0.6,
    y: 0.4,
    w: 8,
    h: 0.5,
    fontFace: FONT,
    fontSize: 20,
    bold: true,
    color: COLOR.charbon,
  });

  const TABLE_ROW_H = 0.28;
  const TABLE_MAX_ROWS = 5;
  const tableHeaderStyle = { bold: true, fill: { color: COLOR.charbon }, color: COLOR.turquoise, fontSize: 7.5 };
  const tableCellStyle = { fontSize: 7.5, color: COLOR.charbon, valign: 'top' };

  let cy = 1.1;
  slide.addText('FORMATIONS / DIPLÔMES OBTENUS', {
    x: 0.6, y: cy, w: 5.7, h: 0.25, fontFace: FONT, fontSize: 9, bold: true, color: COLOR.gris,
  });
  cy += 0.3;
  const formations = data.formationDetails || [];
  if (formations.length === 0) {
    slide.addText('Non renseigné', { x: 0.6, y: cy, w: 5.7, h: 0.3, fontFace: FONT, fontSize: 9, color: COLOR.gris });
    cy += 0.4;
  } else {
    const shown = formations.slice(0, TABLE_MAX_ROWS);
    const rows = [
      [
        { text: 'Date', options: tableHeaderStyle },
        { text: 'Diplôme', options: tableHeaderStyle },
        { text: 'Établissement', options: tableHeaderStyle },
        { text: 'Spécialité', options: tableHeaderStyle },
      ],
      ...shown.map((f) => [
        { text: f.obtainedDate || f.year || '', options: tableCellStyle },
        { text: f.degree || '', options: tableCellStyle },
        { text: f.school || '', options: tableCellStyle },
        { text: f.fieldOfStudy || '—', options: tableCellStyle },
      ]),
    ];
    slide.addTable(rows, {
      x: 0.6, y: cy, w: 5.7, colW: [0.75, 1.85, 1.85, 1.25], rowH: TABLE_ROW_H,
      fontFace: FONT, border: { type: 'solid', color: 'E5E5E5', pt: 0.5 }, autoPage: false,
    });
    cy += TABLE_ROW_H * (shown.length + 1);
    if (formations.length > TABLE_MAX_ROWS) {
      slide.addText(`+${formations.length - TABLE_MAX_ROWS} autre(s) - voir le profil complet`, {
        x: 0.6, y: cy, w: 5.7, h: 0.2, fontFace: FONT, fontSize: 6.5, italic: true, color: COLOR.gris,
      });
      cy += 0.22;
    }
  }

  cy += 0.25;
  slide.addText('CERTIFICATIONS SAP', {
    x: 0.6, y: cy, w: 5.7, h: 0.25, fontFace: FONT, fontSize: 9, bold: true, color: COLOR.gris,
  });
  cy += 0.3;
  const certifications = data.certificationDetails || [];
  if (certifications.length === 0) {
    slide.addText('Aucune certification renseignée', {
      x: 0.6, y: cy, w: 5.7, h: 0.3, fontFace: FONT, fontSize: 9, color: COLOR.gris,
    });
  } else {
    const shown = certifications.slice(0, TABLE_MAX_ROWS);
    const rows = [
      [
        { text: 'Date', options: tableHeaderStyle },
        { text: 'Certification', options: tableHeaderStyle },
        { text: 'Validité', options: tableHeaderStyle },
        { text: 'Organisme', options: tableHeaderStyle },
      ],
      ...shown.map((c) => [
        { text: c.obtainedDate || '', options: tableCellStyle },
        { text: c.name || '', options: tableCellStyle },
        { text: c.validityYears ? `${c.validityYears} an${c.validityYears > 1 ? 's' : ''}` : '—', options: tableCellStyle },
        { text: c.issuingBody || '—', options: tableCellStyle },
      ]),
    ];
    slide.addTable(rows, {
      x: 0.6, y: cy, w: 5.7, colW: [0.75, 2.7, 1.0, 1.25], rowH: TABLE_ROW_H,
      fontFace: FONT, border: { type: 'solid', color: 'E5E5E5', pt: 0.5 }, autoPage: false,
    });
    cy += TABLE_ROW_H * (shown.length + 1);
    if (certifications.length > TABLE_MAX_ROWS) {
      slide.addText(`+${certifications.length - TABLE_MAX_ROWS} autre(s) - voir le profil complet`, {
        x: 0.6, y: cy, w: 5.7, h: 0.2, fontFace: FONT, fontSize: 6.5, italic: true, color: COLOR.gris,
      });
    }
  }

  addCard(slide, { x: 6.55, y: 1.1, w: 6.15, h: 3.0 });
  slide.addText('COMPÉTENCES TRANSVERSALES', {
    x: 6.8,
    y: 1.25,
    w: 5.6,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    bold: true,
    color: COLOR.gris,
  });
  slide.addText(
    TRANSVERSAL_SKILLS.map((s) => ({ text: s, options: { bullet: { code: '25AA' }, breakLine: true } })),
    { x: 6.8, y: 1.6, w: 5.6, h: 2.3, fontFace: FONT, fontSize: 10, color: COLOR.charbon, valign: 'top' }
  );

  addCard(slide, { x: 6.55, y: 4.3, w: 6.15, h: 1.0, fill: COLOR.charbon, line: { color: COLOR.charbon } });
  slide.addText('Disponible pour vos projets S/4HANA', {
    x: 6.8,
    y: 4.45,
    w: 5.6,
    h: 0.35,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: COLOR.white,
  });
  slide.addText(`${CONTACT_EMAIL}  ·  Bi2S — Best IS Solutions`, {
    x: 6.8,
    y: 4.8,
    w: 5.6,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    color: COLOR.turquoise,
  });

  addFooter(slide, data, pageNum);
}

function addBackCoverSlide(pres) {
  const slide = pres.addSlide();
  slide.addImage({ path: GRADIENT_BG, x: 0, y: 0, w: 13.33, h: 7.5 });
  slide.addText('SPA Best IS Solutions', {
    x: 0.7,
    y: 2.6,
    w: 9,
    h: 0.7,
    fontFace: FONT,
    fontSize: 28,
    bold: true,
    color: COLOR.white,
  });
  slide.addText("Votre meilleur partenaire en système d'information", {
    x: 0.7,
    y: 3.25,
    w: 9,
    h: 0.4,
    fontFace: FONT,
    fontSize: 14,
    color: COLOR.white,
  });
  slide.addText(
    'ATTAR, Coop Immo EL Amel N°03 Dar El Belda, Alger\n+213 (0) 23 81 14 93 · contact@b-i2s.com · www.b-i2s.com',
    { x: 0.7, y: 6.5, w: 8, h: 0.6, fontFace: FONT, fontSize: 10, color: COLOR.white }
  );
  slide.addImage({ path: LOCKUP_WHITE, x: 10.5, y: 6.55, w: 1.9, h: 1.9 * LOCKUP_RATIO });
}

async function generatePptx(data, outputPath, { photoPath } = {}) {
  const pres = new pptxgen();
  pres.defineLayout({ name: 'BI2S', width: 13.33, height: 7.5 });
  pres.layout = 'BI2S';

  addTitleSlide(pres, data, photoPath);
  addProfileSlide(pres, data, 2);
  const experienceSlideCount = addExperienceSlides(pres, data, 3);
  addFormationSlide(pres, data, 3 + experienceSlideCount);
  addBackCoverSlide(pres);

  await pres.writeFile({ fileName: outputPath });
}

module.exports = { generatePptx };
