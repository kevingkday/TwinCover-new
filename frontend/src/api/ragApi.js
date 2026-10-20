import { apiRequest } from './apiClient';

export const ragApi = {
  async queryPolicyRag(clientId, query, topK = 4) {
    return apiRequest('/rag/query', {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        query,
        top_k: topK
      }),
    });
  }
};
