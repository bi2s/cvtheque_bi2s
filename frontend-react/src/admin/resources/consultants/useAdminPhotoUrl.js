import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

export default function useAdminPhotoUrl(consultantId, hasPhoto) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!hasPhoto) {
      setUrl(null);
      return undefined;
    }
    let objectUrl;
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/consultants/${consultantId}/photo`, { headers: { Authorization: getAuthHeader() } })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (blob && !cancelled) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [consultantId, hasPhoto]);

  return url;
}
