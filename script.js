// Almacenamiento
let fuentes = [];
let noticias = [];
let leidas = new Set();

// Cargar datos guardados al iniciar
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

// Añadir fuente
function añadirFuente() {
    const nombre = document.getElementById('sourceName').value.trim();
    const rssUrl = document.getElementById('sourceRss').value.trim();
    
    if (!nombre || !rssUrl) {
        mostrarNotificacion('Por favor, completa ambos campos', 'error');
        return;
    }
    
    fuentes.push({ nombre, rss: rssUrl });
    guardarFuentes();
    renderizarFuentes();
    
    // Limpiar campos
    document.getElementById('sourceName').value = '';
    document.getElementById('sourceRss').value = '';
    
    mostrarNotificacion(`✅ Fuente "${nombre}" añadida correctamente`, 'success');
}

// Renderizar fuentes
function renderizarFuentes() {
    const container = document.getElementById('sourcesList');
    
    if (fuentes.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 20px;">📭 No hay fuentes aún. Añade algunas usando RSS.</div>';
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
    const fuenteEliminada = fuentes[index].nombre;
    fuentes.splice(index, 1);
    guardarFuentes();
    renderizarFuentes();
    mostrarNotificacion(`🗑️ Fuente "${fuenteEliminada}" eliminada`, 'info');
}

// Obtener RSS y convertirlo a JSON
async function fetchRSS(rssUrl, nombreFuente) {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`;
    try {
        const response = await fetch(proxyUrl);
        const data = await response.json();
        const xmlText = data.contents;
        
        // Parsear XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        // Obtener items
        const items = xmlDoc.querySelectorAll('item');
        const noticiasFuente = [];
        
        items.forEach((item, idx) => {
            const title = item.querySelector('title')?.textContent || '';
            const link = item.querySelector('link')?.textContent || '';
            let description = item.querySelector('description')?.textContent || '';
            const pubDate = item.querySelector('pubDate')?.textContent || '';
            
            // Limpiar HTML de la descripción
            description = description.replace(/<[^>]*>/g, '').trim();
            
            // Extraer imagen
            let imageUrl = '';
            const mediaContent = item.querySelector('media\\:content, content');
            if (mediaContent) imageUrl = mediaContent.getAttribute('url');
            
            const enclosure = item.querySelector('enclosure');
            if (enclosure && !imageUrl) imageUrl = enclosure.getAttribute('url');
            
            // Intentar extraer imagen del description
            if (!imageUrl) {
                const imgMatch = description.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/i);
                if (imgMatch) imageUrl = imgMatch[0];
            }
            
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
        console.error(`Error con RSS de ${rssUrl}:`, error);
        return [];
    }
}

// Actualizar todas las fuentes
async function actualizarTodo() {
    if (fuentes.length === 0) {
        mostrarNotificacion('📌 Primero añade alguna fuente RSS', 'warning');
        return;
    }
    
    const container = document.getElementById('newsContainer');
    container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>🔄 Cargando noticias de todas las fuentes...</p></div>';
    
    let todasLasNoticias = [];
    
    for (const fuente of fuentes) {
        const noticiasFuente = await fetchRSS(fuente.rss, fuente.nombre);
        todasLasNoticias.push(...noticiasFuente);
        await new Promise(r => setTimeout(r, 500));
    }
    
    // Eliminar duplicados por enlace
    const noticiasUnicas = [];
    const enlacesVistos = new Set();
    for (const noticia of todasLasNoticias) {
        if (!enlacesVistos.has(noticia.enlace)) {
            enlacesVistos.add(noticia.enlace);
            noticiasUnicas.push(noticia);
        }
    }
    
    // Ordenar por fecha (más reciente primero)
    noticiasUnicas.sort((a, b) => b.timestamp - a.timestamp);
    
    noticias = noticiasUnicas;
    guardarNoticias();
    renderizarNoticias();
    
    mostrarNotificacion(`✨ Se cargaron ${noticias.length} noticias de ${fuentes.length} fuentes`, 'success');
}

// Renderizar noticias
function renderizarNoticias() {
    const container = document.getElementById('newsContainer');
    
    if (noticias.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 No hay noticias. Haz clic en "Actualizar todas".</div>';
        return;
    }
    
    const noLeidas = noticias.filter(n => !leidas.has(n.id)).length;
    document.title = noLeidas > 0 ? `(${noLeidas}) anduimRSS` : 'anduimRSS';
    
    container.innerHTML = `
        <div class="news-stats">
            📊 ${noticias.length} noticias · 
            <span style="color: #fdcb6e;">✨ ${noLeidas} sin leer</span>
        </div>
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
    
    // Añadir event listeners
    document.querySelectorAll('.news-card').forEach(card => {
        card.addEventListener('click', (e) => {
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
    if (noticias.length === 0) return;
    noticias.forEach(n => leidas.add(n.id));
    guardarLeidas();
    renderizarNoticias();
    mostrarNotificacion('✅ Todas las noticias marcadas como leídas', 'success');
}

function limpiarLeidos() {
    if (noticias.length === 0) return;
    const leidasCount = noticias.filter(n => leidas.has(n.id)).length;
    noticias = noticias.filter(n => !leidas.has(n.id));
    leidas.clear();
    guardarNoticias();
    guardarLeidas();
    renderizarNoticias();
    mostrarNotificacion(`🗑️ Se eliminaron ${leidasCount} noticias leídas`, 'info');
}

function formatearFecha(fechaStr) {
    if (!fechaStr) return 'Fecha desconocida';
    try {
        const fecha = new Date(fechaStr);
        const ahora = new Date();
        const diff = ahora - fecha;
        const horas = Math.floor(diff / 3600000);
        const dias = Math.floor(horas / 24);
        
        if (horas < 1) return 'Hace menos de 1h';
        if (horas < 24) return `Hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
        if (dias < 7) return `Hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
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

function mostrarNotificacion(mensaje, tipo = 'info') {
    // Crear notificación flotante
    const notif = document.createElement('div');
    notif.textContent = mensaje;
    notif.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${tipo === 'success' ? '#00b894' : tipo === 'error' ? '#ff7675' : tipo === 'warning' ? '#fdcb6e' : '#667eea'};
        color: white;
        padding: 12px 20px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 500;
        z-index: 1000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

// Añadir animación de notificación
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

// Event listeners
document.getElementById('addBtn').addEventListener('click', añadirFuente);
document.getElementById('refreshBtn').addEventListener('click', actualizarTodo);
document.getElementById('markReadBtn').addEventListener('click', marcarTodoLeido);
document.getElementById('clearReadBtn').addEventListener('click', limpiarLeidos);

// Inicializar
cargarDatos();