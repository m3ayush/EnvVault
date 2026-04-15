// API base URL — set via VITE_API_URL env var
// In Docker: empty string (nginx proxies /api/ to backend)
// In dev: http://localhost:3001
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
