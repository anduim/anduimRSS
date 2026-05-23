// Almacenamiento
let fuentes = [];
let noticias = [];
let leidas = new Set();
let actualizando = false;

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

function guardarFuentes() { localStorage.setItem('anduimRSS_fuentes', JSON.stringify(fuentes)); }
function guardarNoticias() { localStorage.setItem('anduimRSS_noticias', JSON.stringify(noticias)); }
function guardarLeidas() { localStorage.setItem('anduimRSS_leidas', JSON.stringify([...leidas])); }

// Añadir fuente
function añadirFuente() {
    const nombre = document.getElementById('sourceName').value.trim();
    let rssUrl = document.getElementById('sourceRss').value.trim();
    
    if (!nombre || !rssUrl) {
        mostrarMensaje('❌ Completa ambos campos', true);
        return;
    }
    
    if (!rssUrl.startsWith('http')) rssUrl = 'https://' + rssUrl;
    
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

// Extraer noticias de un RSS (con timeout y múltiples estrategias)
async function fetchRSS(rssUrl, nombreFuente) {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    try {
        const response = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await response.json();
        const xmlText = data.contents;
        
        if (!xmlText || xmlText.length < 100) return [];
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        if (xmlDoc.querySelector('parsererror')) return [];
        
        // Múltiples estrategias para encontrar items
        let items = xmlDoc.querySelectorAll('item');
        if (items.length === 0) items = xmlDoc.querySelectorAll('entry');
        if (items.length === 0) {
            const links = xmlDoc.querySelectorAll('link');
            items = Array.from(links).filter(l => {
                const title = l.getAttribute('title') || l.textContent;
                return title && title.length > 10;
            });
        }
        
        if (items.length === 0) return [];
        
        const noticiasFuente = [];
        // 🔥 CAMBIADO: 25 noticias por fuente (antes 10)
        const maxItems = Math.min(items.length, 25);
        
        for (let idx = 0; idx < maxItems; idx++) {
            const item = items[idx];
            
            // Extraer título
            let title = '';
            const titleElem = item.querySelector('title, titulo, headline');
            if (titleElem) title = titleElem.textContent || titleElem.getAttribute('title');
            if (!title && item.textContent) title = item.textContent.slice(0, 100);
            title = (title || '').trim();
            if (title.length < 8) continue;
            
            // Extraer enlace
            let link = '';
            const linkElem = item.querySelector('link');
            if (linkElem) link = linkElem.textContent || linkElem.getAttribute('href');
            if (!link) {
                const guid = item.querySelector('guid');
                if (guid) link = guid.textContent;
            }
            if (!link) link = item.getAttribute('url') || item.getAttribute('href');
            
            if (link && link.startsWith('/')) {
                try {
                    const baseUrl = new URL(rssUrl);
                    link = baseUrl.origin + link;
                } catch(e) {}
            }
            
            if (!link || link.length < 5) continue;
            
            // Extraer descripción
            let description = '';
            const descElem = item.querySelector('description, summary, content');
            if (descElem) description = descElem.textContent || '';
            description = description.replace(/<[^>]*>/g, '').trim().slice(0, 160);
            
            // Extraer fecha
            let pubDate = '';
            const dateElem = item.querySelector('pubDate, published, updated');
            if (dateElem) pubDate = dateElem.textContent;
            
            // Extraer imagen
            let imageUrl = '';
            const media = item.querySelector('media\\:content, content, enclosure');
            if (media) imageUrl = media.getAttribute('url') || media.getAttribute('src');
            if (!imageUrl) {
                const imgMatch = description.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/i);
                if (imgMatch) imageUrl = imgMatch[0];
            }
            
            noticiasFuente.push({
                id: `${link}_${idx}`,
                titulo: title.slice(0, 100),
                enlace: link,
                descripcion: description || title.slice(0, 100),
                imagen: imageUrl || `https://placehold.co/600x400/1e1e1e/667eea?text=${encodeURIComponent(nombreFuente.slice(0, 2))}`,
                fuente: nombreFuente,
                fecha: pubDate,
                timestamp: new Date(pubDate || Date.now()).getTime()
            });
        }
        
        console.log(`✅ ${nombreFuente}: ${noticiasFuente.length} noticias`);
        return noticiasFuente;
        
    } catch (error) {
        clearTimeout(timeoutId);
        console.warn(`❌ ${nombreFuente}: ${error.message}`);
        return [];
    }
}

// ACTUALIZAR EN PARALELO (RÁPIDO)
async function actualizarTodo() {
    if (fuentes.length === 0) {
        mostrarMensaje('📌 Primero añade alguna fuente RSS', true);
        return;
    }
    
    if (actualizando) {
        mostrarMensaje('⏳ Ya está actualizando...', true);
        return;
    }
    
    actualizando = true;
    const container = document.getElementById('newsContainer');
    container.innerHTML = '<div class="loading-state">🔄 Cargando ' + fuentes.length + ' fuentes en paralelo...</div>';
    
    // Carga paralela (todas las fuentes a la vez)
    const promesas = fuentes.map(fuente => fetchRSS(fuente.rss, fuente.nombre));
    const resultados = await Promise.all(promesas);
    
    // Combinar resultados
    let todasLasNoticias = [];
    const fuentesConNoticias = [];
    
    for (let i = 0; i < resultados.length; i++) {
        if (resultados[i].length > 0) {
            todasLasNoticias.push(...resultados[i]);
            fuentesConNoticias.push(fuentes[i].nombre);
        }
    }
    
    // Diagnóstico: mostrar fuentes que fallaron
    const fuentesFallidas = fuentes.filter(f => !fuentesConNoticias.includes(f.nombre));
    if (fuentesFallidas.length > 0) {
        const nombres = fuentesFallidas.map(f => f.nombre).join(', ');
        mostrarMensaje(`⚠️ Sin noticias: ${nombres}`, true);
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
    
    // Ordenar: más nuevas primero
    noticiasUnicas.sort((a, b) => b.timestamp - a.timestamp);
    
    noticias = noticiasUnicas;
    guardarNoticias();
    renderizarNoticias();
    
    actualizando = false;
    mostrarMensaje(`✨ ${noticias.length} noticias de ${fuentesConNoticias.length}/${fuentes.length} fuentes`);
}

function renderizarNoticias() {
    const container = document.getElementById('newsContainer');
    
    if (noticias.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 No hay noticias. Haz clic en "Actualizar todas".</div>';
        return;
    }
    
    const noLeidas = noticias.filter(n => !leidas.has(n.id)).length;
    document.title = noLeidas > 0 ? `(${noLeidas}) anduimRSS` : 'anduimRSS';
    
    const noticiasMostradas = noticias.slice(0, 50);
    
    container.innerHTML = `
        <div class="news-stats">📊 ${noticias.length} noticias · ✨ ${noLeidas} sin leer</div>
        <div class="news-grid">
            ${noticiasMostradas.map(noticia => `
                <div class="news-card ${leidas.has(noticia.id) ? 'read' : ''}" data-url="${noticia.enlace}" data-id="${noticia.id}">
                    <img class="news-image" src="${noticia.imagen}" alt="${escapeHtml(noticia.titulo)}" onerror="this.src='https://placehold.co/130x130/1e1e1e/667eea?text=📰'">
                    <div class="news-content">
                        <div>
                            <div class="news-title">${escapeHtml(noticia.titulo)}</div>
                            <div class="news-description">${escapeHtml(noticia.descripcion)}</div>
                        </div>
                        <div class="news-meta">
                            <span class="news-source">📌 ${escapeHtml(noticia.fuente)}</span>
                            <span class="news-date">${formatearFechaHora(noticia.fecha)}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
        ${noticias.length > 50 ? `<div style="text-align: center; margin-top: 20px; color: var(--text-secondary); font-size: 12px;">📌 Mostrando las 50 más recientes de ${noticias.length}</div>` : ''}
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

// Exportar/Importar
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

// 🔥 NUEVA FUNCIÓN: Fecha y hora juntas
function formatearFechaHora(fechaStr) {
    if (!fechaStr) return 'Fecha?';
    try {
        const fecha = new Date(fechaStr);
        if (isNaN(fecha.getTime())) return 'Fecha?';
        
        const ahora = new Date();
        const diff = ahora - fecha;
        const minutos = Math.floor(diff / 60000);
        const horas = Math.floor(diff / 3600000);
        const dias = Math.floor(diff / 86400000);
        
        // Formato de hora: HH:MM
        const horaStr = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        
        if (minutos < 1) return `Ahora (${horaStr})`;
        if (minutos < 60) return `Hace ${minutos}m (${horaStr})`;
        if (horas < 24) return `Hace ${horas}h (${horaStr})`;
        if (dias < 7) return `${fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} ${horaStr}`;
        
        return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) + ` ${horaStr}`;
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
        max-width: 350px;
        margin: 0 auto;
        background: ${esError ? '#f56565' : '#48bb78'};
        color: white;
        padding: 10px 16px;
        border-radius: 12px;
        text-align: center;
        z-index: 1000;
        animation: fadeInOut 3s ease;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(msgDiv);
    setTimeout(() => msgDiv.remove(), 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Animación
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