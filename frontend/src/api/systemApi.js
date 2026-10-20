import { apiRequest } from './apiClient';

export const systemApi = {
  async getSystemHealth() {
    return apiRequest('/system/health');
  }
};
