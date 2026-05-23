// Almacenamiento
let fuentes = [];
let noticias = [];
let leidas = new Set();

// Cargar datos guardados
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
        mostrarMensaje('❌ Completa ambos campos', true);
        return;
    }
    
    fuentes.push({ nombre, rss: rssUrl });
    guardarFuentes();
    renderizarFuentes();
    
    document.getElementById('sourceName').value = '';
    document.getElementById('sourceRss').value = '';
    
    mostrarMensaje(`✅ Fuente "${nombre}" añadida`);
}

function renderizarFuentes() {
    const container = document.getElementById('sourcesList');
    
    if (fuentes.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary); padding: 10px 0;">📭 No hay fuentes. Añade alguna usando RSS.</div>';
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
                    descripcion: description.slice(0, 180),
                    imagen: imageUrl || `https://placehold.co/600x400/1e1e1e/667eea?text=${encodeURIComponent(nombreFuente.slice(0, 2))}`,
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
        await new Promise(r => setTimeout(r, 400));
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
    
    // ORDENAR: de más nueva a más antigua (las últimas primero)
    noticiasUnicas.sort((a, b) => b.timestamp - a.timestamp);
    
    noticias = noticiasUnicas;
    guardarNoticias();
    renderizarNoticias();
    
    mostrarMensaje(`✨ ${noticias.length} noticias cargadas`);
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
                    <img class="news-image" src="${noticia.imagen}" alt="${escapeHtml(noticia.titulo)}" onerror="this.src='https://placehold.co/130x130/1e1e1e/667eea?text=📰'">
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
    if (noticias.length === 0) return;
    noticias.forEach(n => leidas.add(n.id));
    guardarLeidas();
    renderizarNoticias();
    mostrarMensaje('✅ Todas marcadas como leídas');
}

function limpiarLeidos() {
    if (noticias.length === 0) return;
    const leidasCount = noticias.filter(n => leidas.has(n.id)).length;
    noticias = noticias.filter(n => !leidas.has(n.id));
    leidas.clear();
    guardarNoticias();
    guardarLeidas();
    renderizarNoticias();
    mostrarMensaje(`🗑️ ${leidasCount} noticias leídas eliminadas`);
}

// Exportar fuentes
function exportarFuentes() {
    if (fuentes.length === 0) {
        mostrarMensaje('No hay fuentes para exportar', true);
        return;
    }
    
    const data = JSON.stringify(fuentes, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anduimRSS_fuentes_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarMensaje('✅ Fuentes exportadas');
}

// Importar fuentes
function importarFuentes() {
    const input = document.getElementById('importFile');
    input.click();
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const fuentesImportadas = JSON.parse(event.target.result);
                if (Array.isArray(fuentesImportadas) && fuentesImportadas.every(f => f.nombre && f.rss)) {
                    fuentes = fuentesImportadas;
                    guardarFuentes();
                    renderizarFuentes();
                    mostrarMensaje(`✅ Importadas ${fuentes.length} fuentes`);
                } else {
                    mostrarMensaje('❌ Archivo inválido', true);
                }
            } catch (error) {
                mostrarMensaje('❌ Error al leer el archivo', true);
            }
        };
        reader.readAsText(file);
    };
}

function formatearFecha(fechaStr) {
    if (!fechaStr) return 'Fecha desconocida';
    try {
        const fecha = new Date(fechaStr);
        const ahora = new Date();
        const diff = ahora - fecha;
        const horas = Math.floor(diff / 3600000);
        
        if (horas < 1) return 'Ahora mismo';
        if (horas < 24) return `Hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
        return fecha.toLocaleDateString('es-ES');
    } catch {
        return fechaStr;
    }
}

function mostrarMensaje(mensaje, esError = false) {
    const msgDiv = document.createElement('div');
    msgDiv.textContent = mensaje;
    msgDiv.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        left: 20px;
        max-width: 300px;
        margin: 0 auto;
        background: ${esError ? '#f56565' : '#48bb78'};
        color: white;
        padding: 12px 20px;
        border-radius: 12px;
        text-align: center;
        z-index: 1000;
        animation: fadeInOut 2.5s ease;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(msgDiv);
    setTimeout(() => msgDiv.remove(), 2500);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Añadir animación CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(20px); }
        15% { opacity: 1; transform: translateY(0); }
        85% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(20px); }
    }
`;
document.head.appendChild(style);

// Event listeners
document.getElementById('addBtn').addEventListener('click', añadirFuente);
document.getElementById('refreshBtn').addEventListener('click', actualizarTodo);
document.getElementById('markReadBtn').addEventListener('click', marcarTodoLeido);
document.getElementById('clearReadBtn').addEventListener('click', limpiarLeidos);
document.getElementById('exportBtn').addEventListener('click', exportarFuentes);
document.getElementById('importBtn').addEventListener('click', importarFuentes);

// Inicializar
cargarDatos();