const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export async function apiRequest(endpoint, options = {}) {
  const { baseUrl = API_BASE_URL, ...fetchOptions } = options;
  const url = `${baseUrl}${endpoint}`;
  const headers = { ...fetchOptions.headers };

  // Inject JWT Bearer token if present
  const token = localStorage.getItem('twincover_token');
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If body is not FormData, default to application/json
  if (fetchOptions.body && !(fetchOptions.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  if (response.status === 401) {
    // Clear token if expired or unauthorized and notify App state
    localStorage.removeItem('twincover_token');
    localStorage.removeItem('twincover_user');
    window.dispatchEvent(new CustomEvent('twincover:unauthorized'));
  }

  if (!response.ok) {
    let errorDetail = 'Request failed';
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorDetail;
    } catch (e) {
      errorDetail = response.statusText || errorDetail;
    }
    throw new Error(errorDetail);
  }

  // Return binary blob if requested (for docx/pdf downloads)
  if (options.responseType === 'blob') {
    return response.blob();
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }

  return response.json();
}
