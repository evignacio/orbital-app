// Endereço base da API. '/api' é o padrão do Docker: o nginx do container (ou o
// proxy do Vite) encaminha para a API tirando o prefixo, então funciona em qualquer
// host e sem CORS. No deploy AWS (CloudFront), troque pelo endereço real da API, sem
// barra no final — ex.: 'https://orbital-api.exemplo.com' — e libere a origem do
// CloudFront em CORS_ORIGINS na API.
export const API_BASE = '/api';
