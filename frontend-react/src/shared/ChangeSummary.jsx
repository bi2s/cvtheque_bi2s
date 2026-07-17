import { Box, Typography, Paper, Stack, Chip } from '@mui/material';

// Every hasXChanged() below is a plain function (not a component) so it can
// be called directly for the "did anything change at all" check in
// ChangeSummary, below - a <Component/> JSX element is never null even when
// the component's own render body returns null, so that check can only work
// against the real boolean, not against the rendered output. Exported (not
// just used internally) so other screens needing the same "what actually
// changed" logic - e.g. the admin validation queue's bulk-approve
// eligibility check - reuse this instead of re-deriving it.
export function hasTitleChanged(previousData, newData) {
  return previousData.title !== newData.title;
}

function TitleDiff({ previousData, newData }) {
  if (!hasTitleChanged(previousData, newData)) return null;
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Titre
      </Typography>
      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
        <Typography sx={{ fontSize: 14, textDecoration: 'line-through', color: 'text.disabled' }}>
          {previousData.title}
        </Typography>
        <Typography sx={{ fontSize: 14, color: 'success.main', fontWeight: 600 }}>{newData.title}</Typography>
      </Stack>
    </Box>
  );
}

// A project counts as changed if it was added/removed, or if any field
// actually submitted for it differs - including roleId/experience* fields
// this component doesn't visually render today. Checking only the
// rendered fields (rolePoints/stageTags) would risk silently hiding the
// whole section when only an invisible field changed, which would be
// worse than always showing it - an admin missing a real change is a
// bigger problem than seeing one extra unchanged-looking row.
function projectChanged(prev, next) {
  if (!prev || !next) return true;
  return (
    JSON.stringify(prev.rolePoints || []) !== JSON.stringify(next.rolePoints || []) ||
    JSON.stringify(prev.stageTags || []) !== JSON.stringify(next.stageTags || []) ||
    (prev.roleId ?? null) !== (next.roleId ?? null) ||
    (prev.experienceLevel ?? null) !== (next.experienceLevel ?? null) ||
    JSON.stringify(prev.experiencePhases || []) !== JSON.stringify(next.experiencePhases || []) ||
    (prev.experienceCertification ?? null) !== (next.experienceCertification ?? null) ||
    (prev.periodStart ?? null) !== (next.periodStart ?? null) ||
    (prev.periodEnd ?? null) !== (next.periodEnd ?? null)
  );
}

export function hasProjectsChanged(previousData, newData) {
  const prevById = new Map(previousData.projects.map((p) => [p.projectId, p]));
  const newById = new Map(newData.projects.map((p) => [p.projectId, p]));
  const allIds = [...new Set([...prevById.keys(), ...newById.keys()])];
  return allIds.some((id) => projectChanged(prevById.get(id), newById.get(id)));
}

function ProjectsDiff({ previousData, newData }) {
  if (!hasProjectsChanged(previousData, newData)) return null;
  const prevById = new Map(previousData.projects.map((p) => [p.projectId, p]));
  const newById = new Map(newData.projects.map((p) => [p.projectId, p]));
  const allIds = [...new Set([...prevById.keys(), ...newById.keys()])];

  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Projets
      </Typography>
      <Stack spacing={1.5} sx={{ mt: 1 }}>
        {allIds.map((id) => {
          const prev = prevById.get(id);
          const next = newById.get(id);
          const isNew = !prev && !!next;
          const isRemoved = !!prev && !next;
          const project = next || prev;
          const prevPoints = prev?.rolePoints || [];
          const nextPoints = next?.rolePoints || [];

          return (
            <Paper
              key={id}
              variant="outlined"
              sx={{
                p: 1.5,
                borderColor: isNew ? 'success.main' : isRemoved ? 'error.main' : 'divider',
                bgcolor: isNew ? 'success.light' : isRemoved ? 'error.light' : 'background.default',
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{project.client}</Typography>
                {isNew && <Chip label="Ajouté" size="small" color="success" />}
                {isRemoved && <Chip label="Retiré" size="small" color="error" />}
              </Stack>
              {(isRemoved ? prev?.periodStart : next?.periodStart) && (
                <Typography
                  sx={{
                    fontSize: 12,
                    color: isRemoved ? 'text.disabled' : 'text.secondary',
                    textDecoration: isRemoved ? 'line-through' : 'none',
                    mb: 0.5,
                  }}
                >
                  Période : {(isRemoved ? prev.periodStart : next.periodStart)} →{' '}
                  {(isRemoved ? prev.periodEnd : next.periodEnd) || '...'}
                </Typography>
              )}
              {isRemoved ? (
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {prevPoints.map((point, i) => (
                    <Typography
                      component="li"
                      key={i}
                      sx={{ fontSize: 13.5, textDecoration: 'line-through', color: 'text.disabled' }}
                    >
                      {point}
                    </Typography>
                  ))}
                </Box>
              ) : (
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {nextPoints.map((point, i) => {
                    const isNewPoint = !isNew && !prevPoints.includes(point);
                    return (
                      <Typography
                        component="li"
                        key={i}
                        sx={{
                          fontSize: 13.5,
                          color: isNewPoint ? 'success.main' : 'text.primary',
                          fontWeight: isNewPoint ? 600 : 400,
                        }}
                      >
                        {point}
                      </Typography>
                    );
                  })}
                </Box>
              )}
              {(isRemoved ? prev?.stageTags : next?.stageTags)?.length > 0 && (
                <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
                  {(isRemoved ? prev.stageTags : next.stageTags).map((tag) => (
                    <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ fontSize: 11, height: 20 }} />
                  ))}
                </Stack>
              )}
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}

export function hasProfileSummaryChanged(previousData, newData) {
  return (previousData.profileSummary || '') !== (newData.profileSummary || '');
}

function ProfileSummaryDiff({ previousData, newData }) {
  if (!hasProfileSummaryChanged(previousData, newData)) return null;
  const prev = previousData.profileSummary || '';
  const next = newData.profileSummary || '';
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Profil
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
        {prev && (
          <Typography sx={{ fontSize: 13.5, textDecoration: 'line-through', color: 'text.disabled' }}>
            {prev}
          </Typography>
        )}
        {next && <Typography sx={{ fontSize: 13.5, color: 'success.main', fontWeight: 600 }}>{next}</Typography>}
      </Stack>
    </Box>
  );
}

export function hasLanguagesChanged(previousData, newData) {
  const prevByName = new Map((previousData.languages || []).map((l) => [l.name, l.level]));
  const newByName = new Map((newData.languages || []).map((l) => [l.name, l.level]));
  const allNames = [...new Set([...prevByName.keys(), ...newByName.keys()])];
  return allNames.some((name) => prevByName.get(name) !== newByName.get(name));
}

function LanguagesDiff({ previousData, newData }) {
  if (!hasLanguagesChanged(previousData, newData)) return null;
  const prevList = previousData.languages || [];
  const newList = newData.languages || [];
  const prevByName = new Map(prevList.map((l) => [l.name, l.level]));
  const newByName = new Map(newList.map((l) => [l.name, l.level]));
  const allNames = [...new Set([...prevByName.keys(), ...newByName.keys()])];

  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Langues
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
        {allNames.map((name) => {
          const prevLevel = prevByName.get(name);
          const nextLevel = newByName.get(name);
          const isNew = !prevLevel && nextLevel;
          const isRemoved = prevLevel && !nextLevel;
          const isChanged = prevLevel && nextLevel && prevLevel !== nextLevel;
          return (
            <Typography
              key={name}
              sx={{
                fontSize: 13.5,
                color: isNew || isChanged ? 'success.main' : isRemoved ? 'error.main' : 'text.primary',
                textDecoration: isRemoved ? 'line-through' : 'none',
              }}
            >
              {name} — {isChanged ? `${prevLevel} → ${nextLevel}` : nextLevel || prevLevel}
            </Typography>
          );
        })}
      </Stack>
    </Box>
  );
}

// Formations have no stable id across an edit (handleEditFormation in
// ChatCvScreen.jsx removes the old entry and re-adds a new one, same as
// every other list here) - keyed by the full tuple of visible fields, same
// "new appears / old disappears" treatment as CertificationsDiff/SkillsDiff
// rather than attempting a true field-level "modified" state, which isn't
// achievable without a stable id.
function formationKey(f) {
  return `${f.year || ''}|${f.degree || ''}|${f.school || ''}|${f.fieldOfStudy || ''}`;
}

export function hasFormationsChanged(previousData, newData) {
  const prevKeys = new Set((previousData.formations || []).map(formationKey));
  const newKeys = new Set((newData.formations || []).map(formationKey));
  return prevKeys.size !== newKeys.size || [...prevKeys].some((k) => !newKeys.has(k)) || [...newKeys].some((k) => !prevKeys.has(k));
}

function FormationsDiff({ previousData, newData }) {
  if (!hasFormationsChanged(previousData, newData)) return null;
  const prevList = previousData.formations || [];
  const newList = newData.formations || [];
  const byKey = new Map();
  for (const f of prevList) byKey.set(formationKey(f), { prev: f, next: null });
  for (const f of newList) {
    const key = formationKey(f);
    byKey.set(key, { ...(byKey.get(key) || {}), next: f });
  }

  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Formation
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
        {[...byKey.entries()].map(([key, { prev, next }]) => {
          const isNew = !prev && !!next;
          const isRemoved = !!prev && !next;
          const f = next || prev;
          return (
            <Typography
              key={key}
              sx={{
                fontSize: 13.5,
                color: isNew ? 'success.main' : isRemoved ? 'error.main' : 'text.primary',
                fontWeight: isNew ? 600 : 400,
                textDecoration: isRemoved ? 'line-through' : 'none',
              }}
            >
              {f.year} — {f.degree}, {f.school}
            </Typography>
          );
        })}
      </Stack>
    </Box>
  );
}

const SKILL_CATEGORY_LABELS = { module: 'Modules SAP', flow: 'Flux', technology: 'Technologies', methodology: 'Méthodologies' };
const SKILL_CATEGORY_ORDER = ['module', 'flow', 'technology', 'methodology'];

export function hasSkillsChanged(previousData, newData) {
  const prevList = previousData.skills || [];
  const newList = newData.skills || [];
  const prevKeys = new Set(prevList.map((s) => `${s.category}|${s.label}`));
  const newKeys = new Set(newList.map((s) => `${s.category}|${s.label}`));
  const prevStarred = prevList.find((s) => s.category === 'module' && s.starred)?.label;
  const newStarred = newList.find((s) => s.category === 'module' && s.starred)?.label;
  return (
    prevKeys.size !== newKeys.size ||
    [...prevKeys].some((k) => !newKeys.has(k)) ||
    [...newKeys].some((k) => !prevKeys.has(k)) ||
    prevStarred !== newStarred
  );
}

function SkillsDiff({ previousData, newData }) {
  if (!hasSkillsChanged(previousData, newData)) return null;
  const prevList = previousData.skills || [];
  const newList = newData.skills || [];

  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Compétences
      </Typography>
      {SKILL_CATEGORY_ORDER.map((cat) => {
        const prevSet = new Set(prevList.filter((s) => s.category === cat).map((s) => s.label));
        const newSet = new Set(newList.filter((s) => s.category === cat).map((s) => s.label));
        const starred = newList.find((s) => s.category === cat && s.starred)?.label;
        const allLabels = [...new Set([...prevSet, ...newSet])];
        if (allLabels.length === 0) return null;
        return (
          <Box key={cat} sx={{ mt: 1 }}>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600 }}>
              {SKILL_CATEGORY_LABELS[cat]}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>
              {allLabels.map((label) => {
                const isNew = !prevSet.has(label) && newSet.has(label);
                const isRemoved = prevSet.has(label) && !newSet.has(label);
                return (
                  <Chip
                    key={label}
                    label={label === starred ? `★ ${label}` : label}
                    size="small"
                    color={isNew ? 'success' : isRemoved ? 'error' : 'default'}
                    variant={isNew || isRemoved ? 'filled' : 'outlined'}
                    sx={isRemoved ? { textDecoration: 'line-through' } : undefined}
                  />
                );
              })}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}

export function hasCertificationsChanged(previousData, newData) {
  const prevSet = new Set(previousData.certifications || []);
  const newSet = new Set(newData.certifications || []);
  const allCerts = [...new Set([...prevSet, ...newSet])];
  return prevSet.size !== newSet.size || allCerts.some((c) => prevSet.has(c) !== newSet.has(c));
}

function CertificationsDiff({ previousData, newData }) {
  if (!hasCertificationsChanged(previousData, newData)) return null;
  const prevSet = new Set(previousData.certifications || []);
  const newSet = new Set(newData.certifications || []);
  const allCerts = [...new Set([...prevSet, ...newSet])];

  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="overline" sx={{ color: 'text.disabled', fontWeight: 700 }}>
        Certifications
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
        {allCerts.map((cert) => {
          const isNew = !prevSet.has(cert) && newSet.has(cert);
          const isRemoved = prevSet.has(cert) && !newSet.has(cert);
          return (
            <Chip
              key={cert}
              label={cert}
              size="small"
              color={isNew ? 'success' : isRemoved ? 'error' : 'default'}
              variant={isNew || isRemoved ? 'filled' : 'outlined'}
              sx={isRemoved ? { textDecoration: 'line-through' } : undefined}
            />
          );
        })}
      </Stack>
    </Box>
  );
}

// Pure, dependency-light diff renderer for the consultant-profile shape
// ({title, projects, certifications, profileSummary, languages, formations,
// skills}). Shared between the admin's change-request review screen and the
// consultant wizard's own "confirm your changes" step - same data shape,
// same rendering, no react-admin dependency either side needs.
//
// Every section above renders nothing when nothing in it actually changed,
// so a section untouched by this submission takes no space in the review -
// only sections with a real difference render at all. If literally nothing
// changed across the whole payload, show a plain "no changes" message
// instead of a blank box (which would look broken, not "all good").
export default function ChangeSummary({ previousData, newData }) {
  const anyChanged =
    hasTitleChanged(previousData, newData) ||
    hasProfileSummaryChanged(previousData, newData) ||
    hasProjectsChanged(previousData, newData) ||
    hasCertificationsChanged(previousData, newData) ||
    hasSkillsChanged(previousData, newData) ||
    hasLanguagesChanged(previousData, newData) ||
    hasFormationsChanged(previousData, newData);

  if (!anyChanged) {
    return <Typography sx={{ color: 'text.disabled', fontSize: 13.5 }}>Aucun changement.</Typography>;
  }

  return (
    <Box>
      <TitleDiff previousData={previousData} newData={newData} />
      <ProfileSummaryDiff previousData={previousData} newData={newData} />
      <ProjectsDiff previousData={previousData} newData={newData} />
      <CertificationsDiff previousData={previousData} newData={newData} />
      <SkillsDiff previousData={previousData} newData={newData} />
      <LanguagesDiff previousData={previousData} newData={newData} />
      <FormationsDiff previousData={previousData} newData={newData} />
    </Box>
  );
}
