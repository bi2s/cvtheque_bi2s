import { useCallback, useState } from 'react';
import { Snackbar, Alert } from '@mui/material';

export function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  return { toast, showToast, closeToast: () => setToast(null) };
}

export function ToastView({ toast, onClose }) {
  return (
    <Snackbar
      open={!!toast}
      autoHideDuration={3500}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      {toast && (
        <Alert onClose={onClose} severity={toast.type} variant="filled" sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      )}
    </Snackbar>
  );
}
