import axios from 'axios';

const TOKEN_KEY = 'study.token';
const USER_KEY = 'study.user';

export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get user() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY));
    } catch {
      return null;
    }
  },
  save(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000' });

api.interceptors.request.use(config => {
  const token = session.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  response => response,
  error => {
    // An expired/invalid token on a protected call ends the session.
    if (error.response?.status === 401 && session.token && !error.config.url.startsWith('/auth/login')) {
      session.clear();
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

export function errorMessage(error) {
  return error.response?.data?.error || 'Something went wrong. Please try again.';
}

export default api;
