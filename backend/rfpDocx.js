// Builds the RFP response .docx via the `docx` package - same "modular
// function per section, composed by one top-level generator" shape as
// pptx.js's slide functions. Proposal generation is template-filling, not
// free-form AI drafting: boilerplate sections are pulled verbatim from
// rfp_boilerplate_sections, dynamic sections are assembled from
// extracted_data + the selected/scored consultants - no section is drafted
// from scratch by a model.
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Header,
  Footer,
  PageNumber,
  TableOfContents,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
} = require('docx');

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ text, heading: level, pageBreakBefore: level === HeadingLevel.HEADING_1 });
}

function body(text) {
  return new Paragraph({ children: [new TextRun(text || '—')] });
}

function simpleTable(headerRow, rows) {
  const makeRow = (cells, bold) =>
    new TableRow({
      children: cells.map(
        (c) =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: String(c ?? '—'), bold })] })],
          })
      ),
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [makeRow(headerRow, true), ...rows.map((r) => makeRow(r, false))],
  });
}

function buildTeamSection(consultants) {
  if (!consultants.length) return [body('Aucun consultant sélectionné.')];
  return [
    simpleTable(
      ['Consultant', 'Titre', 'Score de correspondance'],
      consultants.map((c) => [c.name, c.title || '—', c.score !== null && c.score !== undefined ? `${c.score}%` : '—'])
    ),
  ];
}

function buildComplianceSection(complianceRows) {
  if (!complianceRows || complianceRows.length === 0) {
    return [body("Aucune exigence détectée automatiquement dans le document source - complétez manuellement si besoin.")];
  }
  return [
    simpleTable(
      ['Exigence détectée', 'Statut', 'Élément associé'],
      complianceRows.map((r) => [r.requirement, r.status, r.linkedTo || '—'])
    ),
  ];
}

function buildReferencesSection(pastProjects) {
  if (!pastProjects.length) return [body('Aucune référence sélectionnée.')];
  return [simpleTable(['Client', 'Type de mission', 'Modules'], pastProjects.map((p) => [p.client, p.missionType, (p.modules || []).join(', ')]))];
}

// proposal: { title, extractedData, boilerplateSections, consultants,
//   pastProjects, complianceRows, financialOfferText }
async function generateProposalDocx(proposal) {
  const sections = proposal.extractedData?.sections || {};
  const boilerplateByKey = new Map(proposal.boilerplateSections.map((s) => [s.sectionKey, s]));

  const children = [
    new Paragraph({
      children: [new TextRun({ text: 'RÉPONSE À APPEL D\'OFFRES', bold: true, size: 56 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000, after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: proposal.title, size: 32 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Bi2S — Best IS Solutions', italics: true })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ children: [], pageBreakBefore: true }),
    new TableOfContents('Sommaire', { hyperlink: true, headingStyleRange: '1-2' }),

    heading('Résumé exécutif'),
    body(sections.objectives || "Objectifs non détectés automatiquement - à compléter à partir du cahier des charges."),

    heading('Compréhension du besoin'),
    body(sections.functionalNeeds || 'Besoins fonctionnels non détectés automatiquement - à compléter.'),

    heading('Méthodologie'),
    body(boilerplateByKey.get('methodology')?.content || 'Méthodologie SAP Activate, adaptée au contexte du projet.'),

    heading('Gouvernance de projet'),
    body(boilerplateByKey.get('governance')?.content || 'Gouvernance à définir en phase de cadrage avec le client.'),

    heading('Équipe proposée'),
    ...buildTeamSection(proposal.consultants),

    heading('Planning prévisionnel'),
    body(sections.timeline || 'Planning non détecté automatiquement - à compléter à partir des dates du cahier des charges.'),

    heading('Gestion des risques'),
    body('Les risques identifiés sont suivis dans un registre de risques mis à jour tout au long du projet.'),

    heading('Assurance qualité'),
    body(boilerplateByKey.get('quality_assurance')?.content),

    heading('Sécurité & confidentialité'),
    body(boilerplateByKey.get('security_confidentiality')?.content),

    heading('Livrables'),
    body(sections.deliverables || 'Livrables non détectés automatiquement - à compléter.'),

    heading('Références'),
    ...buildReferencesSection(proposal.pastProjects),

    heading('Profils des consultants'),
    body('CVs détaillés fournis en annexe (export PPTX séparé).'),

    heading('Certifications'),
    body((proposal.consultants.flatMap((c) => c.certifications || []).join(', ')) || 'Aucune certification associée aux consultants sélectionnés.'),

    heading('Offre financière'),
    body(proposal.financialOfferText || 'Offre financière à compléter manuellement.'),

    heading('Conditions commerciales'),
    body(boilerplateByKey.get('commercial_conditions')?.content),

    heading('Présentation de Bi2S'),
    body(boilerplateByKey.get('company_presentation')?.content),

    heading('Matrice de conformité'),
    ...buildComplianceSection(proposal.complianceRows),

    heading("Critères d'évaluation"),
    body(sections.evaluationCriteria || "Critères d'évaluation non détectés automatiquement - à compléter."),
  ];

  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [new Paragraph({ children: [new TextRun({ text: proposal.title, size: 16 })] })],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ children: [PageNumber.CURRENT] }),
                  new TextRun(' / '),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateProposalDocx };
