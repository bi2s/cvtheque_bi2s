const pptxgen = require('pptxgenjs');

async function generatePptx(data, outputPath) {
  const pres = new pptxgen();
  const slide = pres.addSlide();

  slide.addText(data.name, { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 24, bold: true });
  slide.addText(data.title, { x: 0.5, y: 1.0, w: 9, h: 0.6, fontSize: 16, color: '4527A0' });

  const projectLines = [];
  for (const p of data.projects) {
    projectLines.push({
      text: `Projet : ${p.client} — Module : ${p.module} — Rôle : ${p.role}`,
      options: { bold: true, breakLine: true },
    });
    projectLines.push({
      text: p.description,
      options: { breakLine: true, paraSpaceAfter: 12 },
    });
  }
  slide.addText(projectLines.length ? projectLines : [{ text: '' }], {
    x: 0.5,
    y: 1.8,
    w: 9,
    h: 3.5,
    fontSize: 12,
    valign: 'top',
  });

  const certLines = [{ text: 'Certifications SAP obtenues :', options: { bold: true, breakLine: true } }];
  for (const c of data.certifications) {
    certLines.push({ text: `• ${c}`, options: { breakLine: true } });
  }
  slide.addText(certLines, { x: 0.5, y: 5.5, w: 9, h: 1.8, fontSize: 12, valign: 'top' });

  await pres.writeFile({ fileName: outputPath });
}

module.exports = { generatePptx };
