"use client";
import axios from "axios";

// Placeholder — overridden per-request in the interceptor below.
// NEXT_PUBLIC_API_URL is baked at build time (may be localhost in dev builds),
// so we always re-resolve from window.location in the browser at call time.
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1",
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    // Runtime override: always use the page's own origin — works on any domain/port.
    config.baseURL = `${window.location.protocol}//${window.location.host}/api/v1`;
    const token = localStorage.getItem("access_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem("refresh_token");
      if (refresh) {
        try {
          const base = typeof window !== "undefined"
            ? `${window.location.protocol}//${window.location.host}/api/v1`
            : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1");
          const { data } = await axios.post(`${base}/auth/refresh`, {
            refresh_token: refresh,
          });
          localStorage.setItem("access_token", data.access_token);
          localStorage.setItem("refresh_token", data.refresh_token);
          original.headers.Authorization = `Bearer ${data.access_token}`;
          return api(original);
        } catch {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          if (typeof window !== "undefined") window.location.href = "/login";
        }
      } else if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
