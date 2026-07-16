// Builds the RFP response as a .pptx, reusing pptx.js's exact visual
// template (colors, font, cards, lockup, gradient cover/back-cover,
// footer) so a tender response and a consultant CV read as the same
// brand, not two differently-styled documents. Same "template-filling,
// not free-form drafting" approach as the Word generator it replaces:
// boilerplate sections come verbatim from rfp_boilerplate_sections,
// dynamic sections from extracted_data + the selected/scored consultants.
const pptxgen = require('pptxgenjs');
const {
  COLOR,
  FONT,
  GRADIENT_BG,
  LOCKUP_WHITE,
  LOCKUP_RATIO,
  addLockup,
  addCard,
  addFooter,
  addBackCoverSlide,
} = require('./pptx');

function footerText(proposal) {
  return `${proposal.title} — Réponse à appel d'offres`;
}

function addRfpTitleSlide(pres, proposal) {
  const slide = pres.addSlide();
  slide.addImage({ path: GRADIENT_BG, x: 0, y: 0, w: 13.33, h: 7.5 });
  const logoH = 0.72;
  slide.addImage({ path: LOCKUP_WHITE, x: 0.7, y: 0.5, w: logoH / LOCKUP_RATIO, h: logoH });

  slide.addText("RÉPONSE À APPEL D'OFFRES", {
    x: 0.7,
    y: 2.0,
    w: 11.5,
    h: 0.55,
    fontFace: FONT,
    fontSize: 26,
    bold: true,
    color: COLOR.white,
  });
  slide.addText(proposal.title, {
    x: 0.7,
    y: 2.65,
    w: 11.5,
    h: 1.2,
    fontFace: FONT,
    fontSize: 28,
    bold: true,
    color: COLOR.white,
  });

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
}

// Same two-card-side-by-side pattern as pptx.js's addProfileSlide
// (PROFIL/LANGUES cards) - generic here since the RFP deck has many more
// section pairs than the CV does.
function addTwoCardSlide(pres, proposal, pageNum, title, cards) {
  const slide = pres.addSlide();
  slide.background = { color: COLOR.white };
  addLockup(slide);
  slide.addText(title, {
    x: 0.6,
    y: 0.4,
    w: 9,
    h: 0.5,
    fontFace: FONT,
    fontSize: 20,
    bold: true,
    color: COLOR.charbon,
  });

  const cardW = 5.85;
  const cardH = 5.3;
  const positions = [
    { x: 0.6, y: 1.1 },
    { x: 6.65, y: 1.1 },
  ];
  cards.forEach((card, i) => {
    const pos = positions[i];
    addCard(slide, { x: pos.x, y: pos.y, w: cardW, h: cardH, fill: COLOR.menthe, line: { color: COLOR.menthe } });
    slide.addText(card.title, {
      x: pos.x + 0.25,
      y: pos.y + 0.2,
      w: cardW - 0.5,
      h: 0.35,
      fontFace: FONT,
      fontSize: 11,
      bold: true,
      color: COLOR.gris,
    });
    slide.addText(card.body || '—', {
      x: pos.x + 0.25,
      y: pos.y + 0.65,
      w: cardW - 0.5,
      h: cardH - 0.9,
      fontFace: FONT,
      fontSize: 11,
      color: COLOR.charbon,
      valign: 'top',
    });
  });

  addFooter(slide, footerText(proposal), pageNum);
}

function addTeamSlide(pres, proposal, pageNum, consultants) {
  const slide = pres.addSlide();
  slide.background = { color: COLOR.white };
  addLockup(slide);
  slide.addText('ÉQUIPE PROPOSÉE', {
    x: 0.6,
    y: 0.4,
    w: 9,
    h: 0.5,
    fontFace: FONT,
    fontSize: 20,
    bold: true,
    color: COLOR.charbon,
  });

  if (consultants.length === 0) {
    slide.addText('Aucun consultant sélectionné.', {
      x: 0.6,
      y: 1.2,
      w: 10,
      h: 0.4,
      fontFace: FONT,
      fontSize: 12,
      color: COLOR.gris,
    });
  } else {
    const headerStyle = { bold: true, fill: { color: COLOR.charbon }, color: COLOR.turquoise, fontSize: 10 };
    const cellStyle = { fontSize: 10, color: COLOR.charbon, valign: 'top' };
    const rows = [
      [
        { text: 'Consultant', options: headerStyle },
        { text: 'Titre', options: headerStyle },
        { text: 'Score de correspondance', options: headerStyle },
      ],
      ...consultants.map((c) => [
        { text: c.name, options: cellStyle },
        { text: c.title || '—', options: cellStyle },
        { text: c.score !== null && c.score !== undefined ? `${c.score}%` : '—', options: cellStyle },
      ]),
    ];
    slide.addTable(rows, {
      x: 0.6,
      y: 1.2,
      w: 12.1,
      colW: [4.5, 5.6, 2.0],
      rowH: 0.4,
      fontFace: FONT,
      border: { type: 'solid', color: 'E5E5E5', pt: 0.5 },
      autoPage: false,
    });

    const certs = [...new Set(consultants.flatMap((c) => c.certifications || []))];
    slide.addText(
      [
        { text: 'CERTIFICATIONS  ', options: { bold: true, color: COLOR.gris } },
        { text: certs.join(', ') || 'Aucune certification associée aux consultants sélectionnés.', options: {} },
      ],
      {
        x: 0.6,
        y: 1.4 + 0.4 * (consultants.length + 1),
        w: 12.1,
        h: 1.5,
        fontFace: FONT,
        fontSize: 10,
        color: COLOR.charbon,
        valign: 'top',
      }
    );
  }

  addFooter(slide, footerText(proposal), pageNum);
}

function addComplianceSlide(pres, proposal, pageNum, complianceRows) {
  const slide = pres.addSlide();
  slide.background = { color: COLOR.white };
  addLockup(slide);
  slide.addText('MATRICE DE CONFORMITÉ', {
    x: 0.6,
    y: 0.4,
    w: 9,
    h: 0.5,
    fontFace: FONT,
    fontSize: 20,
    bold: true,
    color: COLOR.charbon,
  });

  if (!complianceRows || complianceRows.length === 0) {
    slide.addText(
      "Aucune exigence détectée automatiquement dans le document source - à compléter manuellement si besoin.",
      { x: 0.6, y: 1.2, w: 11, h: 0.6, fontFace: FONT, fontSize: 12, color: COLOR.gris }
    );
  } else {
    const headerStyle = { bold: true, fill: { color: COLOR.charbon }, color: COLOR.turquoise, fontSize: 10 };
    const cellStyle = { fontSize: 10, color: COLOR.charbon, valign: 'top' };
    const statusLabel = { satisfied: 'Satisfait', missing: 'Manquant' };
    const rows = [
      [
        { text: 'Exigence détectée', options: headerStyle },
        { text: 'Statut', options: headerStyle },
        { text: 'Élément associé', options: headerStyle },
      ],
      ...complianceRows.slice(0, 12).map((r) => [
        { text: r.requirement, options: cellStyle },
        { text: statusLabel[r.status] || r.status, options: { ...cellStyle, color: r.status === 'satisfied' ? COLOR.accentGreen : COLOR.charbon, bold: r.status === 'satisfied' } },
        { text: r.linkedTo || '—', options: cellStyle },
      ]),
    ];
    slide.addTable(rows, {
      x: 0.6,
      y: 1.2,
      w: 12.1,
      colW: [6.5, 2.6, 3.0],
      rowH: 0.4,
      fontFace: FONT,
      border: { type: 'solid', color: 'E5E5E5', pt: 0.5 },
      autoPage: false,
    });
  }

  addFooter(slide, footerText(proposal), pageNum);
}

// proposal: { title, extractedData, boilerplateSections, consultants,
//   complianceRows, financialOfferText }
async function generateRfpPptx(proposal) {
  const pres = new pptxgen();
  pres.defineLayout({ name: 'BI2S', width: 13.33, height: 7.5 });
  pres.layout = 'BI2S';

  const sections = proposal.extractedData?.sections || {};
  const boilerplateByKey = new Map(proposal.boilerplateSections.map((s) => [s.sectionKey, s]));
  let page = 2;

  addRfpTitleSlide(pres, proposal);

  addTwoCardSlide(pres, proposal, page++, 'RÉSUMÉ & COMPRÉHENSION DU BESOIN', [
    { title: 'OBJECTIFS', body: sections.objectives || 'Non détectés automatiquement - à compléter à partir du cahier des charges.' },
    { title: 'BESOINS FONCTIONNELS', body: sections.functionalNeeds || 'Non détectés automatiquement - à compléter.' },
  ]);

  addTwoCardSlide(pres, proposal, page++, 'MÉTHODOLOGIE & GOUVERNANCE', [
    { title: 'MÉTHODOLOGIE', body: boilerplateByKey.get('methodology')?.content || 'Méthodologie SAP Activate, adaptée au contexte du projet.' },
    { title: 'GOUVERNANCE DE PROJET', body: boilerplateByKey.get('governance')?.content || 'Gouvernance à définir en phase de cadrage avec le client.' },
  ]);

  addTeamSlide(pres, proposal, page++, proposal.consultants);

  addTwoCardSlide(pres, proposal, page++, 'PLANNING & LIVRABLES', [
    { title: 'PLANNING PRÉVISIONNEL', body: sections.timeline || 'Non détecté automatiquement - à compléter à partir des dates du cahier des charges.' },
    { title: 'LIVRABLES', body: sections.deliverables || 'Non détectés automatiquement - à compléter.' },
  ]);

  addComplianceSlide(pres, proposal, page++, proposal.complianceRows);

  addTwoCardSlide(pres, proposal, page++, 'ASSURANCE QUALITÉ & SÉCURITÉ', [
    { title: 'ASSURANCE QUALITÉ', body: boilerplateByKey.get('quality_assurance')?.content },
    { title: 'SÉCURITÉ & CONFIDENTIALITÉ', body: boilerplateByKey.get('security_confidentiality')?.content },
  ]);

  addTwoCardSlide(pres, proposal, page++, 'CONDITIONS & PRÉSENTATION BI2S', [
    { title: 'CONDITIONS COMMERCIALES', body: boilerplateByKey.get('commercial_conditions')?.content },
    { title: 'PRÉSENTATION DE BI2S', body: boilerplateByKey.get('company_presentation')?.content },
  ]);

  addTwoCardSlide(pres, proposal, page++, 'OFFRE FINANCIÈRE & CRITÈRES D\'ÉVALUATION', [
    { title: 'OFFRE FINANCIÈRE', body: proposal.financialOfferText || 'À compléter manuellement.' },
    { title: "CRITÈRES D'ÉVALUATION", body: sections.evaluationCriteria || "Non détectés automatiquement - à compléter." },
  ]);

  addBackCoverSlide(pres);

  return pres.write({ outputType: 'nodebuffer' });
}

module.exports = { generateRfpPptx };
