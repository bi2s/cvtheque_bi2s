import { HttpError } from 'react-admin';
import { API_BASE_URL } from '../api';
import { readAuth } from '../authStorage';

function getAuthHeader() {
  const auth = readAuth();
  if (!auth) return null;
  return 'Basic ' + btoa(`${auth.username}:${auth.password}`);
}

async function apiFetch(path, options = {}) {
  const authHeader = getAuthHeader();
  const headers = { ...(options.headers || {}) };
  if (authHeader) headers.Authorization = authHeader;
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    throw new HttpError((body && body.detail) || res.statusText, res.status, body);
  }
  return body;
}

function paginateSortFilter(records, params, { searchFields = [], defaultSortField = 'id' }) {
  let result = records;
  const { q, ...exactFilters } = params.filter || {};
  const qTrim = (q || '').toLowerCase().trim();
  if (qTrim && searchFields.length > 0) {
    result = result.filter((r) =>
      searchFields.some((f) => {
        const v = r[f];
        if (Array.isArray(v)) return v.some((item) => (item || '').toLowerCase().includes(qTrim));
        return (v || '').toString().toLowerCase().includes(qTrim);
      })
    );
  }
  for (const [field, value] of Object.entries(exactFilters)) {
    if (value === undefined || value === null || value === '') continue;
    result = result.filter((r) =>
      Array.isArray(r[field]) ? r[field].includes(value) : String(r[field]) === String(value)
    );
  }

  const { field = defaultSortField, order = 'ASC' } = params.sort || {};
  result = [...result].sort((a, b) => {
    const av = (a[field] ?? '').toString().toLowerCase();
    const bv = (b[field] ?? '').toString().toLowerCase();
    if (av < bv) return order === 'ASC' ? -1 : 1;
    if (av > bv) return order === 'ASC' ? 1 : -1;
    return 0;
  });

  const total = result.length;
  const { page = 1, perPage = 25 } = params.pagination || {};
  const start = (page - 1) * perPage;
  return { data: result.slice(start, start + perPage), total };
}

const consultantsResource = {
  async getList(params) {
    const [all, utilization, assignments] = await Promise.all([
      apiFetch('/api/consultants'),
      apiFetch('/api/admin/staffing-utilization').catch(() => []),
      apiFetch('/api/admin/staffing-assignments').catch(() => []),
    ]);
    // Joined in here (not in the ConsultantList component) specifically so
    // utilizationPct/currentProjectClient become real fields on the record
    // react-admin's Datagrid sorts against - this dataProvider already does
    // all sorting/filtering client-side (paginateSortFilter below), so a
    // field only "sortable" if it exists on the record by the time that
    // runs.
    const utilByConsultant = new Map(utilization.map((u) => [u.consultantId, u.utilizationPct]));
    const todayIso = new Date().toISOString().slice(0, 10);
    const currentProjectByConsultant = new Map();
    for (const a of assignments) {
      if (a.startDate <= todayIso && a.endDate >= todayIso) {
        currentProjectByConsultant.set(a.consultantId, { client: a.projectClient, endDate: a.endDate });
      }
    }
    // "Non renseignée" reuses the same incompleteness signal as the list's
    // own "Profil incomplet" row treatment (no seniorityLevel on file) - the
    // utilization endpoint itself can't distinguish "confirmed free" from
    // "we have no idea" (a consultant with zero current assignments simply
    // isn't in that response at all), so a complete profile with no
    // assignment reads as genuinely available instead.
    const enriched = all.map((c) => {
      const current = currentProjectByConsultant.get(c.id);
      const utilizationPct = utilByConsultant.get(c.id) ?? null;
      let availabilityTier;
      if (!c.seniorityLevel) availabilityTier = 'non_renseignee';
      else if (!utilizationPct) availabilityTier = 'disponible';
      else if (utilizationPct >= 70) availabilityTier = 'staffe';
      else availabilityTier = 'partiel';
      return {
        ...c,
        utilizationPct,
        availabilityTier,
        currentProjectClient: current?.client || null,
        currentProjectEndDate: current?.endDate || null,
      };
    });
    return paginateSortFilter(enriched, params, {
      searchFields: ['name', 'username', 'title', 'seniorityLevel', 'modules'],
      defaultSortField: 'name',
    });
  },
  async getOne(params) {
    const data = await apiFetch(`/api/consultants/${params.id}`);
    return { data };
  },
  async create(params) {
    const { password, ...rest } = params.data;
    const response = await apiFetch('/api/admin/consultants', {
      method: 'POST',
      body: JSON.stringify(params.data),
    });
    return { data: { ...rest, id: response.id } };
  },
  async update(params) {
    // Send the full record, not just {name, title, username} - the backend
    // accepts seniorityLevel/missionTypeIds/personal-info fields/gender too
    // (ConsultantProfileFields.jsx already exposes them on this form); a
    // narrower payload here silently dropped every edit to those fields.
    const data = await apiFetch(`/api/admin/consultants/${params.id}`, {
      method: 'PUT',
      body: JSON.stringify(params.data),
    });
    return { data };
  },
  async delete(params) {
    await apiFetch(`/api/admin/consultants/${params.id}`, { method: 'DELETE' });
    return { data: params.previousData };
  },
};

const catalogProjectsResource = {
  async getList(params) {
    const all = await apiFetch('/api/projects/catalog');
    return paginateSortFilter(all, params, { searchFields: ['client'], defaultSortField: 'client' });
  },
  async getOne(params) {
    const all = await apiFetch('/api/projects/catalog');
    const data = all.find((p) => String(p.id) === String(params.id));
    if (!data) throw new HttpError('Projet introuvable', 404);
    return { data };
  },
  async create(params) {
    const response = await apiFetch('/api/admin/projects', {
      method: 'POST',
      body: JSON.stringify(params.data),
    });
    return { data: { ...params.data, id: response.id } };
  },
  async update(params) {
    await apiFetch(`/api/admin/projects/${params.id}`, {
      method: 'PUT',
      body: JSON.stringify(params.data),
    });
    return { data: { ...params.data, id: params.id } };
  },
  async delete(params) {
    await apiFetch(`/api/admin/projects/${params.id}`, { method: 'DELETE' });
    return { data: params.previousData };
  },
};

const changeRequestsResource = {
  async getList(params) {
    const all = await apiFetch('/api/admin/change-requests');
    return paginateSortFilter(all, params, { searchFields: ['consultantName'], defaultSortField: 'submittedAt' });
  },
  async getOne(params) {
    const data = await apiFetch(`/api/admin/change-requests/${params.id}`);
    return { data };
  },
};

const candidatesResource = {
  async getList(params) {
    const all = await apiFetch('/api/admin/candidates');
    return paginateSortFilter(all, params, {
      searchFields: ['firstName', 'lastName', 'desiredPosition'],
      defaultSortField: 'createdAt',
    });
  },
  async getOne(params) {
    const data = await apiFetch(`/api/admin/candidates/${params.id}`);
    return { data };
  },
  // Creation happens via CandidateCvUpload.jsx's own multipart fetch (needs
  // to send the CV file alongside the form fields) - it bypasses dataProvider
  // entirely, same pattern as PhotoUploadButton.jsx, so this is never called.
  async create() {
    throw new Error('Use the CV upload flow to create a candidate.');
  },
  async update(params) {
    const data = await apiFetch(`/api/admin/candidates/${params.id}`, {
      method: 'PUT',
      body: JSON.stringify(params.data),
    });
    return { data };
  },
  async delete(params) {
    await apiFetch(`/api/admin/candidates/${params.id}`, { method: 'DELETE' });
    return { data: params.previousData };
  },
};

const resources = {
  consultants: consultantsResource,
  catalogProjects: catalogProjectsResource,
  changeRequests: changeRequestsResource,
  candidates: candidatesResource,
};

const dataProvider = {
  getList: (resource, params) => resources[resource].getList(params),
  getOne: (resource, params) => resources[resource].getOne(params),
  getMany: (resource, params) =>
    Promise.all(params.ids.map((id) => resources[resource].getOne({ id }))).then((results) => ({
      data: results.map((r) => r.data),
    })),
  getManyReference: () => Promise.reject(new Error('getManyReference not supported')),
  create: (resource, params) => resources[resource].create(params),
  update: (resource, params) => resources[resource].update(params),
  updateMany: (resource, params) =>
    Promise.all(params.ids.map((id) => resources[resource].update({ id, data: params.data }))).then((results) => ({
      data: results.map((r) => r.data.id),
    })),
  delete: (resource, params) => resources[resource].delete(params),
  deleteMany: (resource, params) =>
    Promise.all(
      params.ids.map((id) => resources[resource].delete({ id, previousData: { id } }))
    ).then(() => ({ data: params.ids })),
};

export default dataProvider;
