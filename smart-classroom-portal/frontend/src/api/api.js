import axios from "axios";

const getBaseURL = () => {
  if (typeof window !== "undefined" && window.location) {
    const host = window.location.hostname || "localhost";
    return `http://${host}:5000/api`;
  }
  return "http://localhost:5000/api";
};

const api = axios.create({
  baseURL: getBaseURL(),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || "";
    if (
      error.response &&
      error.response.status === 401 &&
      !url.includes("/auth/login") &&
      !url.includes("/auth/register")
    ) {
      console.warn("Session expired or unauthorized. Clearing credentials.");
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.dispatchEvent(new CustomEvent("auth:logout"));
    }
    return Promise.reject(error);
  }
);

export default api;
