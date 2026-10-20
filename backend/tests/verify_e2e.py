import httpx

def main():
    base = 'http://127.0.0.1:8000/api'
    
    # 1. Login
    res = httpx.post(f'{base}/auth/login', json={'email': 'broker@twincover.com', 'password': 'TwinCover2026!'})
    print('1. Login HTTP:', res.status_code)
    assert res.status_code == 200, res.text
    token = res.json()['access_token']
    headers = {'Authorization': f'Bearer {token}'}

    # 2. Get Current Broker
    res_me = httpx.get(f'{base}/auth/me', headers=headers)
    print('2. Current Broker Profile:', res_me.json()['full_name'], '|', res_me.json()['agency_name'])
    assert res_me.status_code == 200

    # 3. Get Clients
    res_clients = httpx.get(f'{base}/clients/', headers=headers)
    clients = res_clients.json()
    assert len(clients) > 0
    client = clients[0]
    print('3. Found Client Account:', client['name'], '| Account #:', client['account_number'])

    # 4. Upload Policy PDF
    pdf_path = 'data/sample_policies/Apex_Logistics_Renewal_Policy_2026.pdf'
    with open(pdf_path, 'rb') as f:
        files = {'file': ('Apex_Logistics_Renewal_Policy_2026.pdf', f.read(), 'application/pdf')}
        data = {'client_id': client['id']}
        res_upload = httpx.post(f'{base}/policies/upload', headers=headers, data=data, files=files, timeout=30.0)
    print('4. Policy Ingest & Parse HTTP:', res_upload.status_code)
    assert res_upload.status_code == 201, res_upload.text
    pol = res_upload.json()
    fields = pol.get('extracted_fields') or {}
    print('   Extracted Policy #:', fields.get('policy_number'))
    print('   Extracted CGL Limit:', fields.get('cgl_limit'))
    print('   Extracted Cyber Deductible:', fields.get('cyber_deductible'))
    print('   Extracted Total Premium:', fields.get('total_premium'))
    print('   Verification Status:', fields.get('verified'))

    # 5. Verify & Confirm Fields
    update_data = {
        'insured_name': fields.get('insured_name'),
        'policy_number': fields.get('policy_number'),
        'insurer': fields.get('insurer'),
        'effective_date': fields.get('effective_date'),
        'expiry_date': fields.get('expiry_date'),
        'cgl_limit': fields.get('cgl_limit'),
        'property_limit': fields.get('property_limit'),
        'cyber_limit': fields.get('cyber_limit'),
        'cyber_deductible': fields.get('cyber_deductible'),
        'total_premium': fields.get('total_premium'),
        'verified': True
    }
    res_verify = httpx.put(f'{base}/policies/{pol["id"]}/fields', headers=headers, json=update_data)
    print('5. Fields Confirmed HTTP:', res_verify.status_code, '| Verified:', res_verify.json().get('verified'))
    assert res_verify.status_code == 200
    assert res_verify.json().get('verified') is True

    # 6. Generate Letter
    templates = httpx.get(f'{base}/letters/templates', headers=headers).json()
    assert len(templates) > 0
    tmpl = templates[0]
    gen_payload = {
        'client_id': client['id'],
        'policy_id': pol['id'],
        'template_id': tmpl['id'],
        'custom_instructions': 'Emphasize the cyber deductible requirements',
        'use_llm_polish': False
    }
    res_gen = httpx.post(f'{base}/letters/generate', headers=headers, json=gen_payload)
    print('6. Letter Generated HTTP:', res_gen.status_code, '| Title:', res_gen.json()['title'])
    assert res_gen.status_code == 200

    # 7. Test Export DOCX and PDF
    res_docx = httpx.post(
        f'{base}/letters/export/docx',
        headers=headers,
        json={'title': 'Commercial Renewal Summary', 'content': res_gen.json()['content'], 'client_name': client['name']}
    )
    print('7a. Export DOCX Size:', len(res_docx.content), 'bytes')
    assert res_docx.status_code == 200
    assert len(res_docx.content) > 1000

    res_pdf = httpx.post(
        f'{base}/letters/export/pdf',
        headers=headers,
        json={'title': 'Commercial Renewal Summary', 'content': res_gen.json()['content'], 'client_name': client['name']}
    )
    print('7b. Export PDF Size:', len(res_pdf.content), 'bytes')
    assert res_pdf.status_code == 200
    assert res_pdf.content.startswith(b'%PDF')

    # 8. Test Client-Scoped RAG
    rag_payload = {
        'client_id': client['id'],
        'query': 'What is the cyber deductible and retention amount?',
        'top_k': 3
    }
    res_rag = httpx.post(f'{base}/rag/query', headers=headers, json=rag_payload, timeout=30.0)
    print('8. RAG Query HTTP:', res_rag.status_code)
    assert res_rag.status_code == 200
    rag_res = res_rag.json()
    print('   RAG Answer:', rag_res['answer'][:140], '...')
    print('   Citations count:', len(rag_res['sources']))
    if rag_res['sources']:
        print('   Top Cited Section:', rag_res['sources'][0]['section_title'])

    # 9. System Health
    res_health = httpx.get(f'{base}/system/health')
    print('9. System Health HTTP:', res_health.status_code, '| All Operational:', res_health.json()['all_operational'])
    assert res_health.status_code == 200

    print('\n======================================================')
    print(' SUCCESS: All TwinCover API and pipeline tests passed!')
    print('======================================================')

if __name__ == '__main__':
    main()
