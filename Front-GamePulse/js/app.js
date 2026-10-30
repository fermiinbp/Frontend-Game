import { API_URL } from "./config.js";
import { listarGames, listarGeneros, resenasDe, escribirResena, login, logout, usuarioActual } from "./api.js";

// ESTADO
const estado = { pagina: 1, limite: 12, filtros: {}, juegoAbierto: null };

const $ = selector => document.querySelector(selector);

// Evita que el texto de una reseña pueda meter HTML en la página
function escapar(texto = "") {
    return String(texto)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function mostrarMensaje(texto, esError = false) {
    $("#estado").textContent = texto;
    $("#estado").classList.toggle("error", esError);
}

// CATÁLOGO + PAGINACIÓN (la API filtra y pagina, el front solo manda los parámetros)
async function cargarGames() {
    mostrarMensaje("Cargando...");
    try {
        const { data, page, totalPages, total } = await listarGames({
            ...estado.filtros,
            page: estado.pagina,
            limit: estado.limite
        });
        pintarGames(data);
        pintarPaginacion(page, totalPages);
        mostrarMensaje(total ? `${total} videojuegos` : "No hay videojuegos con esos filtros");
    } catch (error) {
        $("#rejilla").innerHTML = "";
        pintarPaginacion(1, 1);
        mostrarMensaje(`No se pudo conectar con la API: ${error.message}`, true);
    }
}

function pintarGames(games) {
    $("#rejilla").innerHTML = games.map(g => `
        <article class="tarjeta">
            ${g.headerImage
                ? `<img class="tarjeta__imagen" src="${escapar(g.headerImage)}" alt="" loading="lazy">`
                : `<div class="tarjeta__portada">${escapar(g.name)}</div>`}
            <div class="tarjeta__cuerpo">
                <h3>${escapar(g.name)}</h3>
                <p class="tarjeta__meta">${escapar((g.genres || []).join(", "))}</p>
                <p class="tarjeta__meta">${escapar((g.developers || []).join(", "))}${g.releaseDate ? " · " + new Date(g.releaseDate).getFullYear() : ""}</p>
                <div class="tarjeta__pie">
                    <span class="precio ${g.isFree ? "precio--gratis" : ""}">${g.isFree ? "Gratis" : "De pago"}</span>
                    <button type="button" data-id="${g.id}">Reseñas</button>
                </div>
            </div>
        </article>`
    ).join("");
}

function pintarPaginacion(pagina, paginas) {
    $("#paginaActual").textContent = `Página ${pagina} de ${paginas || 1}`;
    $("#anterior").disabled = pagina <= 1;
    $("#siguiente").disabled = pagina >= paginas;
}

$("#anterior").addEventListener("click", () => {
    estado.pagina--;
    cargarGames();
});

$("#siguiente").addEventListener("click", () => {
    estado.pagina++;
    cargarGames();
});

// FILTROS
async function cargarGeneros() {
    try {
        const generos = await listarGeneros();
        $("#filtroGenero").innerHTML = `<option value="">Todos los géneros</option>` +
            generos.map(g => `<option value="${escapar(g)}">${escapar(g)}</option>`).join("");
    } catch {
        // Si falla, se queda solo "Todos los géneros"
    }
}

function aplicarFiltros() {
    const valores = Object.fromEntries(new FormData($("#formBusqueda")));
    estado.filtros = Object.fromEntries(
        Object.entries(valores).filter(([, valor]) => valor !== "")
    );
    estado.pagina = 1;
    cargarGames();
}

$("#formBusqueda").addEventListener("submit", evento => {
    evento.preventDefault();
    aplicarFiltros();
});

// Los desplegables filtran nada más cambiarlos
["#filtroGenero", "#filtroGratis", "#orden"].forEach(id =>
    $(id).addEventListener("change", aplicarFiltros)
);

// SESIÓN
function pintarSesion() {
    const usuario = usuarioActual();
    $("#sesion").innerHTML = usuario
        ? `<span>Hola, ${escapar(usuario.username)} (${escapar(usuario.role)})</span>
           <button type="button" id="btnSalir">Salir</button>`
        : `<button type="button" id="btnEntrar" class="boton-principal">Iniciar sesión</button>`;

    // Solo USER y ADMIN pueden escribir reseñas
    const puedeEscribir = usuario && ["USER", "ADMIN"].includes(usuario.role);
    $("#formResena").hidden = !puedeEscribir;
    $("#avisoLogin").hidden = Boolean(puedeEscribir);
    $("#avisoLogin").textContent = usuario
        ? "Tu rol no permite escribir reseñas."
        : "Inicia sesión para escribir una reseña.";
}

$("#sesion").addEventListener("click", evento => {
    if (evento.target.id === "btnEntrar") {
        $("#loginError").textContent = "";
        $("#dialogoLogin").showModal();
    }
    if (evento.target.id === "btnSalir") {
        logout();
        pintarSesion();
        mostrarMensaje("Sesión cerrada");
    }
});

$("#formLogin").addEventListener("submit", async evento => {
    evento.preventDefault();
    const { email, password } = Object.fromEntries(new FormData(evento.target));
    try {
        await login(email, password);
        evento.target.reset();
        $("#dialogoLogin").close();
        pintarSesion();
        mostrarMensaje("Sesión iniciada");
    } catch (error) {
        $("#loginError").textContent = error.message;
    }
});

// RESEÑAS
function estrellas(n) {
    return "★".repeat(n) + "☆".repeat(5 - n);
}

async function cargarResenas() {
    $("#listaResenas").innerHTML = "<li>Cargando...</li>";
    try {
        const resenas = await resenasDe(estado.juegoAbierto);
        $("#listaResenas").innerHTML = resenas.length
            ? resenas.map(r => `
                <li class="resena">
                    <div class="resena__cabecera">
                        <b>${escapar(r.username || "Anónimo")}</b>
                        <span class="resena__estrellas" aria-label="${r.rating} de 5">${estrellas(r.rating)}</span>
                    </div>
                    ${r.comment ? `<p>${escapar(r.comment)}</p>` : ""}
                </li>`).join("")
            : "<li>Todavía no hay reseñas</li>";
    } catch (error) {
        $("#listaResenas").innerHTML = `<li class="estado error">${escapar(error.message)}</li>`;
    }
}

$("#rejilla").addEventListener("click", evento => {
    const boton = evento.target.closest("button[data-id]");
    if (!boton) return;
    const tarjeta = boton.closest(".tarjeta");
    estado.juegoAbierto = boton.dataset.id;
    $("#juegoTitulo").textContent = tarjeta.querySelector("h3").textContent;
    $("#juegoInfo").textContent = [...tarjeta.querySelectorAll(".tarjeta__meta")].map(p => p.textContent).join(" · ");
    $("#resenaError").textContent = "";
    pintarSesion();
    $("#dialogoJuego").showModal();
    cargarResenas();
});

$("#formResena").addEventListener("submit", async evento => {
    evento.preventDefault();
    const { rating, comment } = Object.fromEntries(new FormData(evento.target));
    try {
        await escribirResena(estado.juegoAbierto, rating, comment);
        evento.target.reset();
        $("#resenaError").textContent = "";
        cargarResenas();
    } catch (error) {
        $("#resenaError").textContent = error.message;
    }
});

// Botones × de los diálogos
document.querySelectorAll("[data-cerrar]").forEach(boton =>
    boton.addEventListener("click", () => boton.closest("dialog").close())
);

// INICIO
$("#urlApi").textContent = API_URL;
pintarSesion();
cargarGeneros();
cargarGames();
