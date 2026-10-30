import { API_URL } from "./config.js";
import {
    listarGames, listarGeneros, obtenerGame, resenasDe, escribirResena,
    login, logout, usuarioActual, estadisticasResenas,
    trending, historialDe, sincronizarSteam
} from "./api.js";

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

// FORMATO DE DATOS DE STEAM
function numero(n) {
    return Number(n || 0).toLocaleString("es-ES");
}

function dinero(cantidad, moneda = "EUR") {
    return Number(cantidad).toLocaleString("es-ES", { style: "currency", currency: moneda || "EUR" });
}

function haceCuanto(fecha) {
    const minutos = Math.round((Date.now() - new Date(fecha)) / 60000);
    if (minutos < 1) return "ahora mismo";
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.round(minutos / 60);
    if (horas < 24) return `hace ${horas} h`;
    return `hace ${Math.round(horas / 24)} días`;
}

// Etiqueta de precio: gratis, precio con descuento o, si aún no hay datos de Steam, "De pago"
function precioHTML(juego) {
    const stat = juego.ultimaStat;
    if (juego.isFree || stat?.price === 0) {
        return `<span class="precio precio--gratis">Gratis</span>`;
    }
    if (!stat || stat.price == null) {
        return `<span class="precio">De pago</span>`;
    }
    const descuento = stat.discountPercent > 0
        ? `<span class="descuento">-${stat.discountPercent}%</span>`
        : "";
    return `<span class="precio">${descuento}${dinero(stat.price, stat.currency)}</span>`;
}

function jugadoresHTML(stat) {
    if (!stat) return "";
    return `<p class="jugadores"><span class="jugadores__punto"></span>${numero(stat.currentPlayers)} jugando</p>`;
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
                ${jugadoresHTML(g.ultimaStat)}
                <div class="tarjeta__pie">
                    ${precioHTML(g)}
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

// MÁS JUGADOS AHORA (última foto de GameStat de cada juego)
async function cargarTrending() {
    try {
        const ranking = await trending(5);
        $("#trending").hidden = ranking.length === 0;
        if (!ranking.length) return;

        $("#trendingFecha").textContent = `Actualizado ${haceCuanto(ranking[0].recordedAt)}`;
        $("#listaTrending").innerHTML = ranking.map((t, i) => `
            <li>
                <button type="button" class="trending__item" data-id="${t.juego.id}">
                    <span class="trending__puesto">${i + 1}</span>
                    ${t.juego.headerImage ? `<img src="${escapar(t.juego.headerImage)}" alt="" loading="lazy">` : ""}
                    <span class="trending__nombre">${escapar(t.juego.name)}</span>
                    <span class="trending__jugadores">${numero(t.currentPlayers)} jugando</span>
                </button>
            </li>`).join("");
    } catch {
        $("#trending").hidden = true;
    }
}

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

// ESTADÍSTICAS (solo ANALYST y ADMIN)
async function cargarEstadisticas() {
    const usuario = usuarioActual();
    const puedeVer = usuario && ["ANALYST", "ADMIN"].includes(usuario.role);
    $("#panelEstadisticas").hidden = !puedeVer;
    if (!puedeVer) return;

    try {
        const { positivas, negativas } = await estadisticasResenas();
        $("#textoEstadisticas").textContent = `${positivas} reseñas positivas · ${negativas} reseñas negativas`;
    } catch (error) {
        $("#textoEstadisticas").textContent = error.message;
    }
}

// SESIÓN
function pintarSesion() {
    const usuario = usuarioActual();
    $("#sesion").innerHTML = usuario
        ? `<span>Hola, ${escapar(usuario.username)} (${escapar(usuario.role)})</span>
           ${usuario.role === "ADMIN" ? `<button type="button" id="btnSync">Sincronizar Steam</button>` : ""}
           <button type="button" id="btnSalir">Salir</button>`
        : `<button type="button" id="btnEntrar" class="boton-principal">Iniciar sesión</button>`;

    // Solo USER y ADMIN pueden escribir reseñas
    const puedeEscribir = usuario && ["USER", "ADMIN"].includes(usuario.role);
    $("#formResena").hidden = !puedeEscribir;
    $("#avisoLogin").hidden = Boolean(puedeEscribir);
    $("#avisoLogin").textContent = usuario
        ? "Tu rol no permite escribir reseñas."
        : "Inicia sesión para escribir una reseña.";

    cargarEstadisticas();
}

$("#sesion").addEventListener("click", evento => {
    if (evento.target.id === "btnEntrar") {
        $("#loginError").textContent = "";
        $("#dialogoLogin").showModal();
    }
    if (evento.target.id === "btnSync") {
        sincronizar(evento.target);
    }
    if (evento.target.id === "btnSalir") {
        logout();
        pintarSesion();
        mostrarMensaje("Sesión cerrada");
    }
});

// Solo ADMIN: pide a Steam los datos de todos los juegos y recarga la página
async function sincronizar(boton) {
    boton.disabled = true;
    boton.textContent = "Sincronizando...";
    mostrarMensaje("Pidiendo datos a Steam...");
    try {
        const { correctos, total } = await sincronizarSteam();
        await Promise.all([cargarGames(), cargarTrending()]);
        mostrarMensaje(`Steam sincronizado: ${correctos} de ${total} juegos`);
    } catch (error) {
        mostrarMensaje(error.message, true);
    } finally {
        boton.disabled = false;
        boton.textContent = "Sincronizar Steam";
    }
}

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

// USUARIOS DE PRUEBA (los de scripts/users.json, todos con la misma contraseña)
document.querySelectorAll("[data-email]").forEach(boton =>
    boton.addEventListener("click", () => {
        $("#loginEmail").value = boton.dataset.email;
        $("#loginPassword").value = "TestPass123!";
        $("#formLogin").requestSubmit();
    })
);

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

// DETALLE DE UN JUEGO: datos de Steam + reseñas
async function abrirJuego(id) {
    estado.juegoAbierto = id;
    $("#juegoTitulo").textContent = "Cargando...";
    $("#juegoInfo").textContent = "";
    $("#juegoSteam").innerHTML = "";
    $("#resenaError").textContent = "";
    pintarSesion();
    $("#dialogoJuego").showModal();
    cargarResenas();

    try {
        const juego = await obtenerGame(id);
        $("#juegoTitulo").textContent = juego.name;
        $("#juegoInfo").textContent = [
            (juego.genres || []).join(", "),
            (juego.developers || []).join(", "),
            juego.releaseDate ? new Date(juego.releaseDate).getFullYear() : ""
        ].filter(Boolean).join(" · ");
        cargarSteam(juego);
    } catch (error) {
        $("#juegoTitulo").textContent = error.message;
    }
}

// Precio, jugadores y evolución (historial de GameStat)
async function cargarSteam(juego) {
    const caja = $("#juegoSteam");
    try {
        const fotos = await historialDe(juego.id);
        if (!fotos.length) {
            caja.innerHTML = `<p class="aviso">Aún no hay datos de Steam para este juego.</p>`;
            return;
        }

        const ultima = fotos[0];
        const fuente = ultima.source === "steamspy" ? " · vía SteamSpy" : "";
        caja.innerHTML = `
            <div class="steam__datos">
                <div><span class="steam__valor">${numero(ultima.currentPlayers)}</span><span class="steam__etiqueta">jugando ahora</span></div>
                <div>${precioHTML({ ...juego, ultimaStat: ultima })}<span class="steam__etiqueta">precio en Steam</span></div>
            </div>
            ${grafica(fotos)}
            <p class="steam__nota">${fotos.length} registros · último ${haceCuanto(ultima.recordedAt)}${fuente}</p>`;
    } catch (error) {
        caja.innerHTML = `<p class="estado error">${escapar(error.message)}</p>`;
    }
}

// Mini gráfica SVG de jugadores (de la foto más antigua a la más nueva)
function grafica(fotos) {
    if (fotos.length < 2) {
        return `<p class="steam__nota">La gráfica aparece a partir de la segunda sincronización.</p>`;
    }
    const valores = [...fotos].reverse().map(f => f.currentPlayers || 0);
    const max = Math.max(...valores);
    const min = Math.min(...valores);
    const ancho = 300, alto = 60;
    const puntos = valores.map((v, i) => {
        const x = (i / (valores.length - 1)) * ancho;
        const y = alto - ((v - min) / (max - min || 1)) * (alto - 6) - 3;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

    return `
        <svg class="steam__grafica" viewBox="0 0 ${ancho} ${alto}" preserveAspectRatio="none" role="img"
             aria-label="Evolución de jugadores: de ${numero(valores[0])} a ${numero(valores.at(-1))}">
            <polyline points="0,${alto} ${puntos} ${ancho},${alto}" class="steam__area"></polyline>
            <polyline points="${puntos}" class="steam__linea"></polyline>
        </svg>
        <p class="steam__rango"><span>Mín. ${numero(min)}</span><span>Máx. ${numero(max)}</span></p>`;
}

$("#rejilla").addEventListener("click", evento => {
    const boton = evento.target.closest("button[data-id]");
    if (boton) abrirJuego(boton.dataset.id);
});

$("#listaTrending").addEventListener("click", evento => {
    const boton = evento.target.closest("button[data-id]");
    if (boton) abrirJuego(boton.dataset.id);
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
cargarTrending();
