import { apiRequest } from './apiClient';

export const policiesApi = {
  async uploadPolicy(clientId, file) {
    const formData = new FormData();
    formData.append('client_id', clientId);
    formData.append('file', file);

    return apiRequest('/policies/upload', {
      method: 'POST',
      body: formData,
    });
  },

  async getClientPolicies(clientId) {
    return apiRequest(`/policies/client/${clientId}`);
  },

  async getPolicy(policyId) {
    return apiRequest(`/policies/${policyId}`);
  },

  async verifyFields(policyId, fields) {
    return apiRequest(`/policies/${policyId}/fields`, {
      method: 'PUT',
      body: JSON.stringify({ ...fields, verified: true }),
    });
  },

  async downloadPolicyPdf(policyId, filename = 'policy.pdf') {
    const blob = await apiRequest(`/policies/${policyId}/download`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  async deletePolicy(policyId) {
    return apiRequest(`/policies/${policyId}`, {
      method: 'DELETE',
    });
  }
};
