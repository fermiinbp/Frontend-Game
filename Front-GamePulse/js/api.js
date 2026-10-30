import { API_URL } from "./config.js";

async function pedir(ruta, opciones = {}) {
    const cabecera = {};
    const token = localStorage.getItem("token");
    if (token) cabecera.Authorization = `Bearer ${token}`;
    if (opciones.body) cabecera["Content-Type"] = "application/json";

    const res = await fetch(`${API_URL}${ruta}`, { ...opciones, headers: cabecera });
    const datos = res.status === 204 ? null : await res.json();
    if (!res.ok) {
        throw new Error(datos?.error || `Error ${res.status}`);
    }
    return datos;
}

// GET /games?page=1&limit=12&buscar=elden&genero=RPG&gratis=true&orden=name
// La API devuelve { data, page, limit, total, totalPages }
export function listarGames(parametros) {
    const query = new URLSearchParams(parametros);
    return pedir(`/games?${query}`);
}

export function listarGeneros() {
    return pedir("/games/genres");
}

export function resenasDe(gameId) {
    return pedir(`/reviews?game=${gameId}`);
}

export function escribirResena(gameId, rating, comment) {
    return pedir("/reviews", {
        method: "POST",
        body: JSON.stringify({ gameId, rating: Number(rating), comment })
    });
}

// Solo ANALYST y ADMIN. Devuelve { positivas, negativas }
export function estadisticasResenas() {
    return pedir("/reviews/stats");
}

export async function login(email, password) {
    const dato = await pedir("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
    });
    localStorage.setItem("token", dato.token);
    localStorage.setItem("usuario", JSON.stringify(dato.usuario));
    return dato.usuario;
}

export function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
}

export function usuarioActual() {
    try {
        return JSON.parse(localStorage.getItem("usuario"));
    } catch {
        return null;
    }
}
