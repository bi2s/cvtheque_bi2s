import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../../api';
import { getAuthHeader } from '../../authHeader';

// Mirrors useAdminPhotoUrl.js - blob-fetches the one consultant_documents
// row marked is_featured (when it's an image; PDFs/pptx scans are never
// passed a truthy featuredDocument.isImage) for use as a CvPreview <img>.
export default function useFeaturedDocumentUrl(featuredDocument) {
  const [url, setUrl] = useState(null);
  const documentId = featuredDocument?.isImage ? featuredDocument.id : null;

  useEffect(() => {
    if (!documentId) {
      setUrl(null);
      return undefined;
    }
    let objectUrl;
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/admin/consultant-documents/${documentId}/download`, {
      headers: { Authorization: getAuthHeader() },
    })
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
  }, [documentId]);

  return url;
}
