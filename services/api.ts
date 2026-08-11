import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Config } from '@/constants/config';

export const api = axios.create({
  baseURL: Config.apiBaseUrl,
  timeout: 15_000,
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('lenzpay_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Retrying the same expired bearer token only creates a duplicate request.
    // Until a real refresh-token endpoint exists, clear the unusable credential
    // and let the caller return the user to authentication.
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('lenzpay_auth_token');
    }
    return Promise.reject(error);
  }
);
