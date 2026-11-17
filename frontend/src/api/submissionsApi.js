import { apiRequest } from './apiClient';

export const submissionsApi = {
  async listSubmissions(params = {}) {
    const query = new URLSearchParams();
    if (params.clientId) query.set('client_id', params.clientId);
    if (params.specialtyLine) query.set('specialty_line', params.specialtyLine);
    if (params.status) query.set('status', params.status);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiRequest(`/submissions/${qs}`);
  },

  async createSubmission(data) {
    return apiRequest('/submissions/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getSubmission(submissionId) {
    return apiRequest(`/submissions/${submissionId}`);
  },

  async updateSubmission(submissionId, data) {
    return apiRequest(`/submissions/${submissionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async captureEvidence(submissionId, { files = [], textNote = '', noteTitle = '' }) {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    if (textNote && textNote.trim()) {
      formData.append('text_note', textNote.trim());
    }
    if (noteTitle && noteTitle.trim()) {
      formData.append('note_title', noteTitle.trim());
    }
    return apiRequest(`/submissions/${submissionId}/capture`, {
      method: 'POST',
      body: formData,
    });
  },

  async triggerExtraction(submissionId) {
    return apiRequest(`/submissions/${submissionId}/extract`, {
      method: 'POST',
    });
  },

  async getJobStatus(jobId) {
    return apiRequest(`/jobs/${jobId}`);
  },

  async addMarketPlacement(submissionId, data) {
    return apiRequest(`/submissions/${submissionId}/placements`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateMarketPlacement(submissionId, placementId, data) {
    return apiRequest(`/submissions/${submissionId}/placements/${placementId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteMarketPlacement(submissionId, placementId) {
    return apiRequest(`/submissions/${submissionId}/placements/${placementId}`, {
      method: 'DELETE',
    });
  },

  async downloadEvidenceArtifact(artifactId, filename = 'evidence_file') {
    const blob = await apiRequest(`/submissions/artifacts/${artifactId}/download`, {
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
};
