import { useEffect, useState } from 'react';
import { usePermissions, useNotify } from 'react-admin';
import { IconButton, Tooltip, CircularProgress } from '@mui/material';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import { subscribeToPush, getPushSubscriptionStatus, pushSupported } from '../pushClient';
import { getAuthHeader } from './authHeader';

// Admin/RH only, matching the audience these push events (new change
// request, new critical alert, candidate stage change) are actually
// relevant to - other roles (pmo/manager/mission roles) don't get this
// button at all rather than a disabled one, to avoid implying it does
// something for them.
export default function PushSubscribeButton() {
  const { permissions } = usePermissions();
  const notify = useNotify();
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    if (!pushSupported()) {
      setStatus('unsupported');
      return;
    }
    getPushSubscriptionStatus().then(setStatus);
  }, []);

  if (!['admin', 'rh'].includes(permissions?.role)) return null;
  if (status === 'unsupported') return null;

  async function handleClick() {
    if (status === 'subscribed' || status === 'checking') return;
    setStatus('checking');
    try {
      await subscribeToPush('admin', getAuthHeader());
      setStatus('subscribed');
      notify('Notifications push activées.', { type: 'success' });
    } catch (e) {
      setStatus('not-subscribed');
      notify(e.message, { type: 'error' });
    }
  }

  return (
    <Tooltip title={status === 'subscribed' ? 'Notifications push activées' : 'Activer les notifications push'}>
      <span>
        <IconButton color="inherit" onClick={handleClick} disabled={status === 'checking' || status === 'subscribed'}>
          {status === 'checking' ? (
            <CircularProgress size={20} color="inherit" />
          ) : status === 'subscribed' ? (
            <NotificationsActiveOutlinedIcon />
          ) : (
            <NotificationsNoneOutlinedIcon />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
}
