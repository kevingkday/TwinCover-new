import { apiRequest } from './apiClient';

export const lettersApi = {
  async listTemplates() {
    return apiRequest('/letters/templates');
  },

  async createTemplate(templateData) {
    return apiRequest('/letters/templates', {
      method: 'POST',
      body: JSON.stringify(templateData),
    });
  },

  async updateTemplate(templateId, templateData) {
    return apiRequest(`/letters/templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(templateData),
    });
  },

  async deleteTemplate(templateId) {
    return apiRequest(`/letters/templates/${templateId}`, {
      method: 'DELETE',
    });
  },

  async generateLetter(clientId, policyId, templateId, customInstructions = '', useLlmPolish = true) {
    return apiRequest('/letters/generate', {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        policy_id: policyId,
        template_id: templateId,
        custom_instructions: customInstructions,
        use_llm_polish: useLlmPolish
      }),
    });
  },

  async saveLetter(letterData) {
    return apiRequest('/letters/save', {
      method: 'POST',
      body: JSON.stringify(letterData),
    });
  },

  async getLetterHistory(clientId) {
    return apiRequest(`/letters/history/${clientId}`);
  },

  async exportDocx(title, content, clientName = '', policyNumber = '') {
    const blob = await apiRequest('/letters/export/docx', {
      method: 'POST',
      body: JSON.stringify({
        title,
        content,
        client_name: clientName,
        policy_number: policyNumber
      }),
      responseType: 'blob'
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9_\-]/g, '_')}.docx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  async exportPdf(title, content, clientName = '', policyNumber = '') {
    const blob = await apiRequest('/letters/export/pdf', {
      method: 'POST',
      body: JSON.stringify({
        title,
        content,
        client_name: clientName,
        policy_number: policyNumber
      }),
      responseType: 'blob'
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9_\-]/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
};
