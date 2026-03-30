// src/api/axios.js — Axios HTTP Client Setup
// This file creates a pre-configured axios instance that:
// 1. Points to our backend API
// 2. Automatically attaches the JWT token to every request

import axios from "axios";

// Create a custom axios instance
const api = axios.create({
  baseURL: "https://testing-repo-1e24.onrender.com/api", // Backend API base URL
  headers: {
    "Content-Type": "application/json",
  },
});

// ---- Request Interceptor ----
// Runs before every request — attaches JWT token from localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ---- Response Interceptor ----
// Handles 401 Unauthorized (expired/invalid token) globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear local storage and redirect to login
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
