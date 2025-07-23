import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_APP_API_URL,
  withCredentials: true,
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
},
  (error) => Promise.reject(error)
);

// Utility function to fetch a file as a blob
export const fetchFileAsBlob = async (fileId) => {
  try {
    const response = await api.get(`/employees/files/${fileId}`, {
      responseType: 'blob',
    });
    console.log("file res : ",response)
    return response.data;
  } catch (error) {
    console.error(`Error fetching file ${fileId}:`, error.response?.data || error.message);
    throw error;
  }
};

export default api;
