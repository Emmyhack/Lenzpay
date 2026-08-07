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

let isRefreshing = false;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // Single retry on 401 while a refresh isn't already in flight — avoids
    // stacking retries if the token is genuinely invalid.
    if (error.response?.status === 401 && !original._retry && !isRefreshing) {
      original._retry = true;
      isRefreshing = true;
      try {
        // Replace with a real refresh-token exchange once the backend exists.
        isRefreshing = false;
        return api(original);
      } catch (refreshError) {
        isRefreshing = false;
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
