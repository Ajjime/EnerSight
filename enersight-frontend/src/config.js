// Automatically detects the correct backend URL
// PC browser   → http://localhost:8000
// Mobile browser → http://192.168.1.55:8000
 
const API_BASE_URL = `http://${window.location.hostname}:8000`;

export default API_BASE_URL;