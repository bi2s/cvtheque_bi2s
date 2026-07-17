import { useRecordContext, useNotify, useRefresh } from 'react-admin';
import { Button, Tooltip } from '@mui/material';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

// Shown instead of ResetPasswordButton when the consultant has no password
// yet (created via the profile-first flow, ConsultantCreate.jsx) - sends
// the same invite e-mail RowActionsMenu's list-row equivalent does.
export default function InviteButton() {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();
  if (!record) return null;

  async function invite() {
    const res = await fetch(`${API_BASE_URL}/api/admin/consultants/${record.id}/invite`, {
      method: 'POST',
      headers: { Authorization: getAuthHeader() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      notify('custom.server_error', { type: 'error', messageArgs: { detail: body.detail || 'Échec' } });
      return;
    }
    notify('custom.invite_sent', { type: 'success', messageArgs: { name: record.name } });
    refresh();
  }

  return (
    <Tooltip title="Envoyer un e-mail d'invitation pour définir un mot de passe">
      <Button variant="outlined" size="small" startIcon={<MailOutlineIcon fontSize="small" />} onClick={invite}>
        Inviter
      </Button>
    </Tooltip>
  );
}
