import { basicAuthHeader } from '../api';

// Builds the same Authorization header react-admin's authProvider/dataProvider
// use, for custom actions that bypass the dataProvider with a raw fetch
// (file downloads, narrow single-purpose PUTs, etc).
export function getAuthHeader() {
  const raw = localStorage.getItem('auth');
  if (!raw) return null;
  const { username, password } = JSON.parse(raw);
  return basicAuthHeader(username, password);
}
