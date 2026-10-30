// En tu ordenador (Live Server) usa la API local; publicado, usa la de Render.
// Cambia la segunda URL por la de tu servicio en Render.
const EN_LOCAL = ["localhost", "127.0.0.1", ""].includes(location.hostname);

export const API_URL = EN_LOCAL
    ? "http://localhost:3000"
    : "https://gamepulse-api.onrender.com";
