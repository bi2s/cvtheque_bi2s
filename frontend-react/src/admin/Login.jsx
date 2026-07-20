import { useLogin, useNotify } from 'react-admin';
import LoginScreen from '../LoginScreen';

// Same shared LoginScreen the app root (ChatCvScreen) uses - which role
// this account has is determined after authenticating, not announced on
// an unauthenticated screen. A consultant credential typed here is a
// normal, expected mistake (bookmarked the wrong URL) - handled by
// redirecting to the app root rather than showing an error, so they don't
// need to retype anything wrong to get where they meant to go, just
// re-enter their password once more on the correct screen.
export default function Login() {
  const login = useLogin();
  const notify = useNotify();

  async function handleAdminSuccess({ username, password, remember }) {
    await login({ username, password, remember });
  }

  async function handleConsultantSuccess() {
    notify('Ceci est un compte consultant - redirection vers votre espace.', { type: 'info' });
    window.location.href = '/';
  }

  return <LoginScreen onAdminSuccess={handleAdminSuccess} onConsultantSuccess={handleConsultantSuccess} />;
}
