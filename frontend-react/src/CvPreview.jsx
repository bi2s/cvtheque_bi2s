import { useState } from 'react';
import { genderizeRoleLabel, genderedConsultantLabel } from './genderize';

const SKILL_SECTIONS = [
  { category: 'module', title: 'Modules SAP S/4HANA' },
  { category: 'flow', title: 'Flux de bout en bout' },
  { category: 'technology', title: 'Technologies & UX' },
  { category: 'methodology', title: 'Méthodologies & outils' },
];

const STYLE = `
  .cv-preview-page{
    --charbon:#1B1D1E; --turquoise:#2FEA99; --menthe:#E8F4EE; --blanc:#FFFFFF;
    --gris:#5A6360; --pill:rgba(47,234,153,.15);
    --grad:linear-gradient(135deg,#1B1D1E 0%,#2FEA99 100%);
    font-family:'Plus Jakarta Sans',-apple-system,'Segoe UI',sans-serif;
    font-weight:400; color:var(--charbon); background:#cfd8d3;
    font-size:9.4pt; line-height:1.42;
  }
  .cv-preview-page *{margin:0;padding:0;box-sizing:border-box;}
  .cv-preview-page .page{
    width:210mm; min-height:297mm; margin:8mm auto;
    background:linear-gradient(90deg,var(--menthe) 0,var(--menthe) 68mm,var(--blanc) 68mm);
    display:flex; align-items:stretch; box-shadow:0 6px 30px rgba(27,29,30,.25);
    border-radius:4px; overflow:hidden; position:relative;
  }
  .cv-preview-page .topbar{ position:absolute; top:0; left:0; width:210mm; height:3.2mm; background:var(--grad); z-index:5; }
  .cv-preview-page .sidebar{ width:68mm; flex:none; padding:12mm 7mm 10mm 8mm; display:flex; flex-direction:column; gap:6.5mm; }
  .cv-preview-page .sb-head{ display:flex; align-items:center; gap:4mm; }
  .cv-preview-page .sb-head img{ width:17mm; height:17mm; }
  .cv-preview-page .sb-head img.photo{ border-radius:50%; object-fit:cover; box-shadow:0 2px 6px rgba(27,29,30,.2); }
  .cv-preview-page .sb-head .who .name{ font-weight:800; font-size:13.5pt; line-height:1.12; letter-spacing:.2px; }
  .cv-preview-page .sb-head .who .role{ font-weight:600; font-size:8pt; color:#127a55; margin-top:1.2mm; }
  .cv-preview-page .sb-block h3{
    font-size:8pt; font-weight:800; letter-spacing:1.6px; text-transform:uppercase;
    margin-bottom:2.8mm; display:flex; align-items:center; gap:2mm;
  }
  .cv-preview-page .sb-block h3::before{ content:""; width:3mm; height:3mm; border-radius:1mm; background:var(--grad); flex:none; }
  .cv-preview-page .contact{ list-style:none; display:flex; flex-direction:column; gap:2mm; }
  .cv-preview-page .contact li{ display:flex; align-items:center; gap:2.4mm; font-size:8.4pt; font-weight:500; }
  .cv-preview-page .cert-card{
    background:var(--blanc); border-radius:14px; padding:4mm 4.5mm;
    box-shadow:0 2px 8px rgba(27,29,30,.08); border:1px solid rgba(47,234,153,.45); margin-bottom:2.5mm;
  }
  .cv-preview-page .cert-card:last-child{ margin-bottom:0; }
  .cv-preview-page .cert-badge{
    display:inline-block; background:var(--grad); color:#fff; font-size:6.8pt; font-weight:700;
    letter-spacing:1px; text-transform:uppercase; padding:1.1mm 3mm; border-radius:99px; margin-bottom:2.2mm;
  }
  .cv-preview-page .cert-card .cert-title{ font-weight:700; font-size:8.8pt; line-height:1.3; }
  .cv-preview-page .skill-group{ margin-bottom:3.6mm; }
  .cv-preview-page .skill-group:last-child{ margin-bottom:0; }
  .cv-preview-page .skill-group .sg-title{ font-weight:700; font-size:8.2pt; margin-bottom:1.6mm; }
  .cv-preview-page .pills{ display:flex; flex-wrap:wrap; gap:1.5mm; }
  .cv-preview-page .pill{
    background:var(--pill); color:var(--charbon); font-size:7.4pt; font-weight:600;
    padding:1mm 2.6mm; border-radius:99px; white-space:nowrap;
  }
  .cv-preview-page .pill.star{ background:var(--charbon); color:var(--turquoise); }
  .cv-preview-page .lang{ list-style:none; display:flex; flex-direction:column; gap:1.8mm; }
  .cv-preview-page .lang li{ display:flex; justify-content:space-between; font-size:8.4pt; }
  .cv-preview-page .lang .lvl{ font-weight:600; color:#127a55; font-size:7.8pt; }
  .cv-preview-page .edu{ display:flex; flex-direction:column; gap:2.8mm; }
  .cv-preview-page .edu .item .yr{ font-weight:800; font-size:8pt; color:#127a55; }
  .cv-preview-page .edu .item .deg{ font-weight:600; font-size:8.4pt; line-height:1.3; margin-top:.4mm; }
  .cv-preview-page .edu .item .sch{ font-size:7.8pt; color:var(--gris); font-weight:300; }
  .cv-preview-page .main{ flex:1; min-width:0; padding:11mm 9mm 10mm 9mm; }
  .cv-preview-page .main-head{ display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:5mm; }
  .cv-preview-page .main-head img{ width:34mm; height:auto; margin-top:1mm; }
  .cv-preview-page .headline h1{ font-weight:800; font-size:21pt; line-height:1.05; letter-spacing:-.3px; }
  .cv-preview-page .headline h2{ font-weight:600; font-size:10.5pt; color:#127a55; margin-top:1.8mm; letter-spacing:.2px; }
  .cv-preview-page .headline .tags{ margin-top:2.4mm; display:flex; gap:1.6mm; flex-wrap:wrap; }
  .cv-preview-page .headline .tags .pill{ font-size:7.2pt; }
  .cv-preview-page .profil{ background:var(--menthe); border-radius:14px; padding:4mm 5mm; font-size:9pt; line-height:1.5; margin-bottom:6mm; }
  .cv-preview-page .sec-title{
    font-weight:800; font-size:11.5pt; letter-spacing:1.4px; text-transform:uppercase;
    display:flex; align-items:center; gap:2.6mm; margin-bottom:4.5mm;
  }
  .cv-preview-page .sec-title::before{ content:""; width:4.2mm; height:4.2mm; border-radius:1.4mm; background:var(--grad); flex:none; }
  .cv-preview-page .copy-btn{
    margin-left:auto; font-family:inherit; font-size:7.4pt; font-weight:700; letter-spacing:.4px; text-transform:none;
    background:var(--blanc); color:var(--charbon); border:1px solid rgba(27,29,30,.18); border-radius:99px;
    padding:1.4mm 3.2mm; cursor:pointer;
  }
  .cv-preview-page .copy-btn:hover{ border-color:var(--charbon); }
  @media print{ .cv-preview-page .copy-btn{ display:none; } }
  .cv-preview-page .timeline{ position:relative; padding-left:6.5mm; }
  .cv-preview-page .timeline::before{
    content:""; position:absolute; left:1.55mm; top:1.5mm; bottom:2mm; width:.55mm;
    background:linear-gradient(180deg,#2FEA99 0%,rgba(47,234,153,.25) 100%); border-radius:99px;
  }
  .cv-preview-page .xp{ position:relative; margin-bottom:5.2mm; break-inside:avoid; page-break-inside:avoid; }
  .cv-preview-page .xp::before{
    content:""; position:absolute; left:-6.5mm; top:1.3mm; width:3.1mm; height:3.1mm;
    background:var(--turquoise); border:.6mm solid var(--blanc); border-radius:50%; box-shadow:0 0 0 .5mm var(--turquoise);
  }
  .cv-preview-page .xp-head{ display:flex; justify-content:space-between; align-items:baseline; gap:3mm; }
  .cv-preview-page .xp-head .role{ font-weight:700; font-size:10.2pt; }
  .cv-preview-page .xp-head .role .client{ color:#127a55; }
  .cv-preview-page .xp .ctx{ font-size:8.6pt; margin:1.4mm 0 1.6mm; color:var(--gris); }
  .cv-preview-page .xp .ctx b{ color:var(--charbon); font-weight:700; }
  .cv-preview-page .xp ul{ list-style:none; display:flex; flex-direction:column; gap:1.1mm; margin-bottom:1.8mm; }
  .cv-preview-page .xp ul li{ position:relative; padding-left:4mm; font-size:8.8pt; }
  .cv-preview-page .xp ul li::before{
    content:""; position:absolute; left:0; top:1.55mm; width:1.8mm; height:1.8mm; border-radius:.6mm; background:var(--turquoise);
  }
  .cv-preview-page .xp .env{ display:flex; flex-wrap:wrap; gap:1.4mm; align-items:center; }
  .cv-preview-page .xp .env .env-label{
    font-size:7pt; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:var(--gris); margin-right:.6mm;
  }
  .cv-preview-page .xp .env .pill{ font-size:7pt; padding:.8mm 2.4mm; }
  .cv-preview-page .xp .stages{ display:flex; flex-wrap:wrap; gap:1.4mm; margin-bottom:1.6mm; }
  .cv-preview-page .xp .stages .pill{ font-size:7pt; background:var(--charbon); color:var(--turquoise); padding:.8mm 2.4mm; }
  .cv-preview-page .empty-hint{ color:var(--gris); font-size:8.6pt; font-style:italic; }
  .cv-preview-page .doc-table{ width:100%; border-collapse:collapse; margin-bottom:2mm; }
  .cv-preview-page .doc-table th{
    background:var(--charbon); color:var(--turquoise); font-size:7.4pt; font-weight:800;
    letter-spacing:.6px; text-transform:uppercase; text-align:left; padding:2mm 2.6mm;
  }
  .cv-preview-page .doc-table td{
    font-size:8.4pt; padding:2mm 2.6mm; border-bottom:1px solid rgba(27,29,30,.08); vertical-align:top;
  }
  .cv-preview-page .doc-table tr:last-child td{ border-bottom:none; }
  .cv-preview-page .doc-table a{ color:#127a55; font-weight:600; text-decoration:none; }

  @page{ size:A4; margin:0; }
  @media print{
    .cv-preview-page{ background:#fff; font-size:9.2pt; }
    .cv-preview-page .page{ width:210mm; margin:0; box-shadow:none; border-radius:0; }
    .cv-preview-page .sidebar{ padding-top:14mm; }
    .cv-preview-page .main{ padding-top:13mm; }
    .cv-preview-page .xp{ page-break-inside:avoid; break-inside:avoid; }
    .cv-preview-page .cert-card, .cv-preview-page .profil, .cv-preview-page .sb-block{ page-break-inside:avoid; break-inside:avoid; }
  }
`;

export default function CvPreview({ detail, photoUrl }) {
  const {
    name,
    title,
    gender,
    profileSummary,
    projects = [],
    languages = [],
    skills = [],
    certificationDetails = [],
    formationDetails = [],
  } = detail;

  const isUrl = (v) => /^https?:\/\//i.test(v || '');

  const [copiedTable, setCopiedTable] = useState(null);

  // Tab-separated rows paste cleanly into Excel/Word as real table cells,
  // which is what "copier le tableau" is for in practice - a plain text
  // dump with spaces would just paste as one unstructured line.
  function copyTable(key, headers, rows) {
    const text = [headers, ...rows].map((row) => row.join('\t')).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopiedTable(key);
      setTimeout(() => setCopiedTable((k) => (k === key ? null : k)), 1800);
    });
  }

  const skillsByCategory = (category) => skills.filter((s) => s.category === category);
  const methodologyTags = skillsByCategory('methodology').map((s) => s.label);
  const starredModule = skillsByCategory('module').find((s) => s.starred)?.label;
  const ownModuleLabels = skillsByCategory('module').map((s) => s.label);

  return (
    <div className="cv-preview-page">
      <style>{STYLE}</style>
      <div className="page">
        <div className="topbar" />

        <aside className="sidebar">
          <div className="sb-head">
            {photoUrl ? (
              <img src={photoUrl} alt={name} className="photo" />
            ) : (
              <img src="/bi2s-mark.svg" alt="Bi2S" />
            )}
            <div className="who">
              <div className="name">{name}</div>
              <div className="role">{title}</div>
            </div>
          </div>

          <div className="sb-block">
            <h3>Contact</h3>
            <ul className="contact">
              <li>Bi2S — Best IS Solutions</li>
              <li>Mobilité nationale</li>
            </ul>
          </div>

          <div className="sb-block">
            <h3>Compétences clés</h3>
            {SKILL_SECTIONS.map((sec) => {
              const items = skillsByCategory(sec.category);
              if (items.length === 0) return null;
              return (
                <div className="skill-group" key={sec.category}>
                  <div className="sg-title">{sec.title}</div>
                  <div className="pills">
                    {items.map((s) => (
                      <span key={s.label} className={`pill${s.starred ? ' star' : ''}`}>
                        {s.label}
                        {s.starred ? ' ★ Expertise' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {languages.length > 0 && (
            <div className="sb-block">
              <h3>Langues</h3>
              <ul className="lang">
                {languages.map((l) => (
                  <li key={l.name}>
                    <span>{l.name}</span>
                    <span className="lvl">{l.level}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </aside>

        <main className="main">
          <div className="main-head">
            <div className="headline">
              <h1>{title}</h1>
              <h2>{starredModule ? `Expertise ${starredModule}` : 'SAP S/4HANA'}</h2>
              <div className="tags">
                {methodologyTags.map((t) => (
                  <span className="pill" key={t}>
                    {t}
                  </span>
                ))}
                <span className="pill">{projects.length} projet(s) S/4HANA</span>
              </div>
            </div>
            <img src="/bi2s-lockup.svg" alt="Bi2S — Best IS Solutions" />
          </div>

          <div className="profil">
            {profileSummary || <span className="empty-hint">Profil non renseigné.</span>}
          </div>

          <div className="sec-title">Expériences professionnelles</div>
          <div className="timeline">
            {projects.length === 0 && <p className="empty-hint">Aucun projet enregistré.</p>}
            {projects.map((p, i) => (
              <article className="xp" key={i}>
                <div className="xp-head">
                  <div className="role">
                    <span className="client">{p.client}</span>
                    {p.modules?.length ? ` — ${p.modules.join(', ')}` : ''}
                  </div>
                </div>
                <div className="ctx">
                  <b>Rôle : </b>
                  {p.roleLabel ? (
                    <>
                      {genderizeRoleLabel(p.roleLabel, gender)}
                      {p.experienceLevel ? ` — ${p.experienceLevel}` : ''}
                    </>
                  ) : (
                    // No structured role set on this assignment (older
                    // entries predate that flow) - fall back to a generic
                    // role line using the consultant's OWN module skills
                    // (their profile-level "Sélectionnez vos modules SAP"
                    // selection), not p.modules (the project's full module
                    // list, already shown in the xp-head line above) - a
                    // consultant staffed as SD-only on a multi-module
                    // project shouldn't have the Rôle line claim MM/FI/CO/PP
                    // too just because the project covers them.
                    `${genderedConsultantLabel(gender)}${ownModuleLabels.length ? ` ${ownModuleLabels.join(', ')}` : ''}`
                  )}
                </div>
                {p.description && (
                  <div className="ctx">
                    <b>Contexte : </b>
                    {p.description}
                  </div>
                )}
                {(() => {
                  // Prefer the richer experiencePhases (structured entry) when
                  // present; fall back to the legacy 4-value stageTags for
                  // assignments submitted before that flow existed.
                  const phases = p.experiencePhases?.length
                    ? p.experiencePhases
                    : p.missionType === 'Intégration'
                      ? p.stageTags
                      : [];
                  return (
                    phases?.length > 0 && (
                      <div className="stages">
                        {phases.map((t) => (
                          <span className="pill" key={t}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )
                  );
                })()}
                {p.rolePoints?.length > 0 && (
                  <ul>
                    {p.rolePoints.map((pt, j) => (
                      <li key={j}>{pt}</li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>

          <div className="sec-title" style={{ marginTop: '6mm' }}>
            Formations / Diplômes obtenus
            {formationDetails.length > 0 && (
              <button
                type="button"
                className="copy-btn"
                onClick={() =>
                  copyTable(
                    'formations',
                    ['Date', 'Diplôme(s) obtenu(s)', 'Établissement / Institut', 'Spécialité'],
                    formationDetails.map((f) => [f.obtainedDate || f.year || '', f.degree || '', f.school || '', f.fieldOfStudy || ''])
                  )
                }
              >
                {copiedTable === 'formations' ? 'Copié ✓' : 'Copier'}
              </button>
            )}
          </div>
          {formationDetails.length === 0 ? (
            <p className="empty-hint">Aucune formation renseignée.</p>
          ) : (
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Diplôme(s) obtenu(s)</th>
                  <th>Établissement / Institut</th>
                  <th>Spécialité</th>
                </tr>
              </thead>
              <tbody>
                {formationDetails.map((f) => (
                  <tr key={f.id}>
                    <td>{f.obtainedDate || f.year}</td>
                    <td>{f.degree}</td>
                    <td>{f.school}</td>
                    <td>{f.fieldOfStudy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="sec-title" style={{ marginTop: '6mm' }}>
            Certifications SAP
            {certificationDetails.length > 0 && (
              <button
                type="button"
                className="copy-btn"
                onClick={() =>
                  copyTable(
                    'certifications',
                    ['Date', 'Certification', 'N° Référence', 'Validité (Années)', 'Organisme'],
                    certificationDetails.map((c) => [
                      c.obtainedDate || '',
                      c.name || '',
                      c.certificateNumber || c.credlyUrl || c.verificationUrl || '',
                      c.validityYears ? `${c.validityYears} an${c.validityYears > 1 ? 's' : ''}` : '',
                      c.issuingBody || '',
                    ])
                  )
                }
              >
                {copiedTable === 'certifications' ? 'Copié ✓' : 'Copier'}
              </button>
            )}
          </div>
          {certificationDetails.length === 0 ? (
            <p className="empty-hint">Aucune certification renseignée.</p>
          ) : (
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Certification</th>
                  <th>N° Référence</th>
                  <th>Validité (Années)</th>
                  <th>Organisme</th>
                </tr>
              </thead>
              <tbody>
                {certificationDetails.map((c) => {
                  const reference = c.certificateNumber || c.credlyUrl || c.verificationUrl;
                  return (
                    <tr key={c.id}>
                      <td>{c.obtainedDate || '—'}</td>
                      <td>{c.name}</td>
                      <td>
                        {reference ? (
                          isUrl(reference) ? (
                            <a href={reference} target="_blank" rel="noreferrer">
                              Voir le certificat
                            </a>
                          ) : (
                            reference
                          )
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{c.validityYears ? `${c.validityYears} an${c.validityYears > 1 ? 's' : ''}` : '—'}</td>
                      <td>{c.issuingBody || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </main>
      </div>
    </div>
  );
}
