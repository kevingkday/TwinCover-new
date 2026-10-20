const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = { ...options.headers };

  // Inject JWT Bearer token if present
  const token = localStorage.getItem('twincover_token');
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If body is not FormData, default to application/json
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Clear token if expired or unauthorized
    localStorage.removeItem('twincover_token');
    localStorage.removeItem('twincover_user');
    if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
      window.location.href = '/login';
    }
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
