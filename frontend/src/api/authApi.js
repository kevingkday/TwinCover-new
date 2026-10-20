import { apiRequest } from './apiClient';

export const authApi = {
  async login(email, password) {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.access_token) {
      localStorage.setItem('twincover_token', data.access_token);
      localStorage.setItem('twincover_user', JSON.stringify(data.user));
    }
    return data;
  },

  async register(email, password, full_name, agency_name) {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name, agency_name }),
    });
    if (data.access_token) {
      localStorage.setItem('twincover_token', data.access_token);
      localStorage.setItem('twincover_user', JSON.stringify(data.user));
    }
    return data;
  },

  async getMe() {
    return apiRequest('/auth/me');
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
