"use client";
import { api } from "./api";

export async function login(email: string, password: string, recaptcha_token?: string) {
  const { data } = await api.post("/auth/login", { email, password, recaptcha_token });
  localStorage.setItem("access_token", data.access_token);
  localStorage.setItem("refresh_token", data.refresh_token);
  return data;
}

export async function logout() {
  try { await api.post("/auth/logout"); } catch (_) {}
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  window.location.href = "/login";
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("access_token");
}
