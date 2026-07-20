import { useListContext, useNotify } from 'react-admin';
import { Button } from '@mui/material';
import MailOutlineIcon from '@mui/icons-material/MailOutline';

// Opens the user's own mail client instead of sending anything server-side -
// no email-sending infrastructure exists in this app yet, and BCC keeps
// recipients from seeing each other's addresses.
export default function BulkContactButton() {
  const { selectedIds, data } = useListContext();
  const notify = useNotify();

  function contact() {
    const rows = data.filter((r) => selectedIds.includes(r.id));
    const emails = [...new Set(rows.map((r) => r.email).filter(Boolean))];
    if (emails.length === 0) {
      notify('Aucune adresse e-mail sur les profils sélectionnés.', { type: 'warning' });
      return;
    }
    window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(','))}`;
  }

  return (
    <Button size="small" startIcon={<MailOutlineIcon />} onClick={contact}>
      Contacter
    </Button>
  );
}
