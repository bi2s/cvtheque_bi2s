import { basicAuthHeader } from '../api';
import { readAuth } from '../authStorage';

// Builds the same Authorization header react-admin's authProvider/dataProvider
// use, for custom actions that bypass the dataProvider with a raw fetch
// (file downloads, narrow single-purpose PUTs, etc).
export function getAuthHeader() {
  const auth = readAuth();
  if (!auth) return null;
  return basicAuthHeader(auth.username, auth.password);
}
