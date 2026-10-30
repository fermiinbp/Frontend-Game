import { API_URL } from "./config.js";

async function pedir(ruta, opciones = {}) {
    const cabecera = {};
    const token = localStorage.getItem("token");
    if(token) cabecera.Authorization = `Bearer ${token}`
    if (opciones.body) cabecera["Content-Type"] = "application/json"

    const res = await fetch(`${API_URL}${ruta}`, {...opciones, headers: cabecera});
    const datos = res.status === 204?null : await res.json();
    if(!res.ok){
        throw new Error(datos?.error || `Error ${res.status}`);
    }
    return datos;
}

export function listarGames(parametros){
    const query = new URLSearchParams(parametros)
    return pedir(`/peliculas?${query}`)
}

export function resenasDe(peliculaId){
    return pedir (`/peliculas/${peliculaId}/resenas`);
}

export function escribirResenas(peliculaId, texto, estrellas){
    const cuerpoRespuesta = {texto, estrellas}
    return pedir(`/peliculas/${peliculaId}/resenas`, {
        method: "POST",
        body: JSON.stringify(cuerpoRespuesta)
    })
}

export async function login(email, password){
    const dato = await pedir ("/auth/login", {
        method:"POST",
        body: JSON.stringify({email,password})
    })
    if(!dato){
        throw new Error ({error: "Usuario y contraseña incorrectos"})
    }
    localStorage.setItem("token", dato.token);
    localStorage.setItem("usuario", JSON.stringify(dato.usuario))

    return dato.usuario;
}

export function logout(){
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
}

export function usuarioActual(){
    return JSON.parse(localStorage.getItem("usuario"));
}