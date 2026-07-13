import { HttpError } from 'react-admin';
import { API_BASE_URL } from '../api';

function getAuthHeader() {
  const raw = localStorage.getItem('auth');
  if (!raw) return null;
  const { username, password } = JSON.parse(raw);
  return 'Basic ' + btoa(`${username}:${password}`);
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
    result = result.filter((r) => searchFields.some((f) => (r[f] || '').toLowerCase().includes(qTrim)));
  }
  for (const [field, value] of Object.entries(exactFilters)) {
    if (value === undefined || value === null || value === '') continue;
    result = result.filter((r) => String(r[field]) === String(value));
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
    const all = await apiFetch('/api/consultants');
    return paginateSortFilter(all, params, { searchFields: ['name', 'username'], defaultSortField: 'name' });
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
    const { name, title, username } = params.data;
    const data = await apiFetch(`/api/admin/consultants/${params.id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, title, username }),
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

const resources = {
  consultants: consultantsResource,
  catalogProjects: catalogProjectsResource,
  changeRequests: changeRequestsResource,
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
