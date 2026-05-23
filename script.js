// Almacenamiento
let fuentes = [];
let noticias = [];
let leidas = new Set();

// Cargar datos al iniciar
function cargarDatos() {
    const fuentesGuardadas = localStorage.getItem('anduimRSS_fuentes');
    const noticiasGuardadas = localStorage.getItem('anduimRSS_noticias');
    const leidasGuardadas = localStorage.getItem('anduimRSS_leidas');
    
    if (fuentesGuardadas) fuentes = JSON.parse(fuentesGuardadas);
    if (noticiasGuardadas) noticias = JSON.parse(noticiasGuardadas);
    if (leidasGuardadas) leidas = new Set(JSON.parse(leidasGuardadas));
    
    renderizarFuentes();
    renderizarNoticias();
}

function guardarFuentes() {
    localStorage.setItem('anduimRSS_fuentes', JSON.stringify(fuentes));
}

function guardarNoticias() {
    localStorage.setItem('anduimRSS_noticias', JSON.stringify(noticias));
}

function guardarLeidas() {
    localStorage.setItem('anduimRSS_leidas', JSON.stringify([...leidas]));
}

// Función para mostrar mensajes
function mostrarMensaje(mensaje, esError = false) {
    const msgDiv = document.createElement('div');
    msgDiv.textContent = mensaje;
    msgDiv.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${esError ? '#ff7675' : '#00b894'};
        color: white;
        padding: 12px 20px;
        border-radius: 12px;
        z-index: 1000;
        animation: fadeInOut 3s ease;
    `;
    document.body.appendChild(msgDiv);
    setTimeout(() => msgDiv.remove(), 3000);
}

// Añadir fuente (CORREGIDO)
function añadirFuente() {
    const nombre = document.getElementById('sourceName').value.trim();
    const rssUrl = document.getElementById('sourceRss').value.trim();
    
    if (!nombre || !rssUrl) {
        mostrarMensaje('❌ Por favor, completa ambos campos', true);
        return;
    }
    
    fuentes.push({ nombre, rss: rssUrl });
    guardarFuentes();
    renderizarFuentes();
    
    // Limpiar campos
    document.getElementById('sourceName').value = '';
    document.getElementById('sourceRss').value = '';
    
    mostrarMensaje(`✅ Fuente "${nombre}" añadida correctamente`);
}

function renderizarFuentes() {
    const container = document.getElementById('sourcesList');
    
    if (fuentes.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary); padding: 20px; text-align: center;">📭 No hay fuentes aún. Añade algunas usando RSS.</div>';
        return;
    }
    
    container.innerHTML = fuentes.map((f, i) => `
        <div class="source-tag">
            <span>📌 ${escapeHtml(f.nombre)}</span>
            <button onclick="eliminarFuente(${i})">✖</button>
        </div>
    `).join('');
}

function eliminarFuente(index) {
    const nombre = fuentes[index].nombre;
    fuentes.splice(index, 1);
    guardarFuentes();
    renderizarFuentes();
    mostrarMensaje(`🗑️ Fuente "${nombre}" eliminada`);
}

// Obtener RSS
async function fetchRSS(rssUrl, nombreFuente) {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`;
    try {
        const response = await fetch(proxyUrl);
        const data = await response.json();
        const xmlText = data.contents;
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const items = xmlDoc.querySelectorAll('item');
        const noticiasFuente = [];
        
        items.forEach((item, idx) => {
            const title = item.querySelector('title')?.textContent || '';
            const link = item.querySelector('link')?.textContent || '';
            let description = item.querySelector('description')?.textContent || '';
            const pubDate = item.querySelector('pubDate')?.textContent || '';
            
            description = description.replace(/<[^>]*>/g, '').trim();
            
            let imageUrl = '';
            const mediaContent = item.querySelector('media\\:content, content');
            if (mediaContent) imageUrl = mediaContent.getAttribute('url');
            
            const enclosure = item.querySelector('enclosure');
            if (enclosure && !imageUrl) imageUrl = enclosure.getAttribute('url');
            
            if (title && link && title.length > 5) {
                noticiasFuente.push({
                    id: `${link}_${idx}`,
                    titulo: title.trim(),
                    enlace: link,
                    descripcion: description.slice(0, 200),
                    imagen: imageUrl || `https://placehold.co/600x400/16213e/667eea?text=${encodeURIComponent(nombreFuente.slice(0, 2))}`,
                    fuente: nombreFuente,
                    fecha: pubDate,
                    timestamp: new Date(pubDate || Date.now()).getTime()
                });
            }
        });
        
        return noticiasFuente;
    } catch (error) {
        console.error(error);
        return [];
    }
}

// Actualizar todas las fuentes
async function actualizarTodo() {
    if (fuentes.length === 0) {
        mostrarMensaje('📌 Primero añade alguna fuente RSS', true);
        return;
    }
    
    const container = document.getElementById('newsContainer');
    container.innerHTML = '<div class="loading-state">🔄 Cargando noticias...</div>';
    
    let todasLasNoticias = [];
    
    for (const fuente of fuentes) {
        const noticiasFuente = await fetchRSS(fuente.rss, fuente.nombre);
        todasLasNoticias.push(...noticiasFuente);
        await new Promise(r => setTimeout(r, 500));
    }
    
    // Eliminar duplicados
    const noticiasUnicas = [];
    const enlacesVistos = new Set();
    for (const noticia of todasLasNoticias) {
        if (!enlacesVistos.has(noticia.enlace)) {
            enlacesVistos.add(noticia.enlace);
            noticiasUnicas.push(noticia);
        }
    }
    
    noticiasUnicas.sort((a, b) => b.timestamp - a.timestamp);
    noticias = noticiasUnicas;
    guardarNoticias();
    renderizarNoticias();
    
    mostrarMensaje(`✨ Se cargaron ${noticias.length} noticias`);
}

function renderizarNoticias() {
    const container = document.getElementById('newsContainer');
    
    if (noticias.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 No hay noticias. Haz clic en "Actualizar todas".</div>';
        return;
    }
    
    const noLeidas = noticias.filter(n => !leidas.has(n.id)).length;
    document.title = noLeidas > 0 ? `(${noLeidas}) anduimRSS` : 'anduimRSS';
    
    container.innerHTML = `
        <div class="news-stats">📊 ${noticias.length} noticias · ✨ ${noLeidas} sin leer</div>
        <div class="news-grid">
            ${noticias.map(noticia => `
                <div class="news-card ${leidas.has(noticia.id) ? 'read' : ''}" data-url="${noticia.enlace}" data-id="${noticia.id}">
                    <img class="news-image" src="${noticia.imagen}" alt="${escapeHtml(noticia.titulo)}" onerror="this.src='https://placehold.co/130x130/16213e/667eea?text=📰'">
                    <div class="news-content">
                        <div>
                            <div class="news-title">${escapeHtml(noticia.titulo)}</div>
                            <div class="news-description">${escapeHtml(noticia.descripcion)}</div>
                        </div>
                        <div class="news-meta">
                            <span class="news-source">📌 ${escapeHtml(noticia.fuente)}</span>
                            <span class="news-date">${formatearFecha(noticia.fecha)}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    document.querySelectorAll('.news-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            const url = card.dataset.url;
            
            if (!leidas.has(id)) {
                leidas.add(id);
                guardarLeidas();
                card.classList.add('read');
                renderizarNoticias();
            }
            
            window.open(url, '_blank');
        });
    });
}

function marcarTodoLeido() {
    noticias.forEach(n => leidas.add(n.id));
    guardarLeidas();
    renderizarNoticias();
    mostrarMensaje('✅ Todas las noticias marcadas como leídas');
}

function limpiarLeidos() {
    const leidasCount = noticias.filter(n => leidas.has(n.id)).length;
    noticias = noticias.filter(n => !leidas.has(n.id));
    leidas.clear();
    guardarNoticias();
    guardarLeidas();
    renderizarNoticias();
    mostrarMensaje(`🗑️ Se eliminaron ${leidasCount} noticias leídas`);
}

function formatearFecha(fechaStr) {
    if (!fechaStr) return 'Fecha desconocida';
    try {
        const fecha = new Date(fechaStr);
        const ahora = new Date();
        const diff = ahora - fecha;
        const horas = Math.floor(diff / 3600000);
        
        if (horas < 1) return 'Hace menos de 1h';
        if (horas < 24) return `Hace ${horas} horas`;
        return fecha.toLocaleDateString('es-ES');
    } catch {
        return fechaStr;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Event listeners
document.getElementById('addBtn').addEventListener('click', añadirFuente);
document.getElementById('refreshBtn').addEventListener('click', actualizarTodo);
document.getElementById('markReadBtn').addEventListener('click', marcarTodoLeido);
document.getElementById('clearReadBtn').addEventListener('click', limpiarLeidos);

// Inicializar
cargarDatos();

// Añadir animación CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translateX(100%); }
        10% { opacity: 1; transform: translateX(0); }
        90% { opacity: 1; transform: translateX(0); }
        100% { opacity: 0; transform: translateX(100%); }
    }
`;
document.head.appendChild(style);