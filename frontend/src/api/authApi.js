import { apiRequest } from './apiClient';

function persistAuthSession(data) {
  if (data.access_token) {
    localStorage.setItem('twincover_token', data.access_token);
    localStorage.setItem('twincover_user', JSON.stringify(data.user));
  }
  return data;
}

const AUTH_API_BASE = '/api';

export const authApi = {
  async login(email, password) {
    const data = await apiRequest('/auth/login', {
      baseUrl: AUTH_API_BASE,
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return persistAuthSession(data);
  },

  async register(email, password, full_name, agency_name) {
    const data = await apiRequest('/auth/register', {
      baseUrl: AUTH_API_BASE,
      method: 'POST',
      body: JSON.stringify({ email, password, full_name, agency_name }),
    });
    return persistAuthSession(data);
  },

  async googleAuth(credential, agency_name) {
    const data = await apiRequest('/auth/google', {
      baseUrl: AUTH_API_BASE,
      method: 'POST',
      body: JSON.stringify({ credential, agency_name }),
    });
    return persistAuthSession(data);
  },

  async getMe() {
    const data = await apiRequest('/auth/me', { baseUrl: AUTH_API_BASE });
    if (data) {
      localStorage.setItem('twincover_user', JSON.stringify(data));
    }
    return data;
  },

  async updateProfile(profileData) {
    const data = await apiRequest('/auth/me', {
      baseUrl: AUTH_API_BASE,
      method: 'PATCH',
      body: JSON.stringify(profileData),
    });
    if (data) {
      localStorage.setItem('twincover_user', JSON.stringify(data));
    }
    return data;
  },

  logout() {
    localStorage.removeItem('twincover_token');
    localStorage.removeItem('twincover_user');
  },

  getCurrentUser() {
    const u = localStorage.getItem('twincover_user');
    return u ? JSON.parse(u) : null;
  },

  isAuthenticated() {
    return !!localStorage.getItem('twincover_token');
  }
};
