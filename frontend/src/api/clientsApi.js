import { apiRequest } from './apiClient';

export const clientsApi = {
  async listClients(query = '') {
    const qParam = query ? `?q=${encodeURIComponent(query)}` : '';
    return apiRequest(`/clients/${qParam}`);
  },

  async createClient(clientData) {
    return apiRequest('/clients/', {
      method: 'POST',
      body: JSON.stringify(clientData),
    });
  },

  async getClient(clientId) {
    return apiRequest(`/clients/${clientId}`);
  },

  async updateClient(clientId, clientData) {
    return apiRequest(`/clients/${clientId}`, {
      method: 'PUT',
      body: JSON.stringify(clientData),
    });
  },

  async deleteClient(clientId) {
    return apiRequest(`/clients/${clientId}`, {
      method: 'DELETE',
    });
  }
};
