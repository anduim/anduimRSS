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
    let url = document.getElementById('sourceRss').value.trim();
    
    if (!nombre || !url) {
        mostrarMensaje('❌ Completa ambos campos', true);
        return;
    }
    
    if (!url.startsWith('http')) url = 'https://' + url;
    
    fuentes.push({ nombre, url });
    guardarFuentes();
    renderizarFuentes();
    
    document.getElementById('sourceName').value = '';
    document.getElementById('sourceRss').value = '';
    mostrarMensaje(`✅ Fuente "${nombre}" añadida`);
}

function renderizarFuentes() {
    const container = document.getElementById('sourcesList');
    
    if (fuentes.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary); padding: 10px 0;">📭 No hay fuentes. Añade una web o RSS.</div>';
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

// 🔥 NUEVO: Detectar si es RSS o web normal
function esRssUrl(url) {
    return url.toLowerCase().includes('.xml') || 
           url.toLowerCase().includes('/rss') ||
           url.toLowerCase().includes('/feed');
}

// 🔥 NUEVO: Extraer noticias desde HTML normal (como las primeras versiones)
async function extraerDesdeHTML(url, nombreFuente) {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    try {
        const response = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await response.json();
        const html = data.contents;
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Buscar artículos con selectores comunes
        const selectores = [
            'article', '.article', '.noticia', '.news-item', '.post', 
            '.entry', '.card', '.story', '[data-article]'
        ];
        
        let items = [];
        for (const sel of selectores) {
            const encontrados = doc.querySelectorAll(sel);
            if (encontrados.length > 0) {
                items = encontrados;
                break;
            }
        }
        
        // Fallback: buscar enlaces con títulos grandes
        if (items.length === 0) {
            const enlaces = doc.querySelectorAll('a');
            items = Array.from(enlaces).filter(a => {
                const texto = a.textContent.trim();
                return texto.length > 20 && texto.length < 200 && a.href;
            });
        }
        
        const noticiasFuente = [];
        const maxItems = Math.min(items.length, 25);
        
        for (let idx = 0; idx < maxItems; idx++) {
            const item = items[idx];
            
            // Extraer título
            let titulo = '';
            const tituloElem = item.querySelector('h1, h2, h3, h4, .title, .headline');
            if (tituloElem) titulo = tituloElem.textContent.trim();
            if (!titulo && item.textContent) titulo = item.textContent.trim().slice(0, 100);
            if (!titulo || titulo.length < 15) continue;
            
            // Extraer enlace
            let enlace = '';
            const linkElem = item.querySelector('a');
            if (linkElem && linkElem.href) enlace = linkElem.href;
            else if (item.href) enlace = item.href;
            
            if (enlace && enlace.startsWith('/')) {
                try {
                    const baseUrl = new URL(url);
                    enlace = baseUrl.origin + enlace;
                } catch(e) {}
            }
            
            if (!enlace || !enlace.startsWith('http')) continue;
            
            // Extraer imagen
            let imagen = '';
            const imgElem = item.querySelector('img');
            if (imgElem && imgElem.src) {
                imagen = imgElem.src;
                if (imagen.startsWith('/')) {
                    try {
                        const baseUrl = new URL(url);
                        imagen = baseUrl.origin + imagen;
                    } catch(e) {}
                }
            }
            
            // Extraer descripción
            let descripcion = '';
            const descElem = item.querySelector('p, .summary, .description');
            if (descElem) descripcion = descElem.textContent.trim().slice(0, 160);
            if (!descripcion && titulo) descripcion = titulo.slice(0, 160);
            
            noticiasFuente.push({
                id: `${enlace}_${idx}`,
                titulo: titulo.slice(0, 100),
                enlace: enlace,
                descripcion: descripcion,
                imagen: imagen || `https://placehold.co/600x400/1e1e1e/667eea?text=${encodeURIComponent(nombreFuente.slice(0, 2))}`,
                fuente: nombreFuente,
                fecha: new Date().toISOString(),
                timestamp: Date.now()
            });
        }
        
        console.log(`✅ ${nombreFuente} (HTML): ${noticiasFuente.length} noticias`);
        return noticiasFuente;
        
    } catch (error) {
        console.warn(`❌ ${nombreFuente} (HTML): ${error.message}`);
        return [];
    }
}

// Extraer noticias desde RSS
async function extraerDesdeRSS(rssUrl, nombreFuente) {
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
        
        let items = xmlDoc.querySelectorAll('item');
        if (items.length === 0) items = xmlDoc.querySelectorAll('entry');
        
        if (items.length === 0) return [];
        
        const noticiasFuente = [];
        const maxItems = Math.min(items.length, 25);
        
        for (let idx = 0; idx < maxItems; idx++) {
            const item = items[idx];
            
            let titulo = '';
            const titleElem = item.querySelector('title, titulo, headline');
            if (titleElem) titulo = titleElem.textContent || titleElem.getAttribute('title');
            if (!titulo && item.textContent) titulo = item.textContent.slice(0, 100);
            titulo = (titulo || '').trim();
            if (titulo.length < 8) continue;
            
            let enlace = '';
            const linkElem = item.querySelector('link');
            if (linkElem) enlace = linkElem.textContent || linkElem.getAttribute('href');
            if (!enlace) {
                const guid = item.querySelector('guid');
                if (guid) enlace = guid.textContent;
            }
            if (!enlace) enlace = item.getAttribute('url') || item.getAttribute('href');
            
            if (enlace && enlace.startsWith('/')) {
                try {
                    const baseUrl = new URL(rssUrl);
                    enlace = baseUrl.origin + enlace;
                } catch(e) {}
            }
            
            if (!enlace || enlace.length < 5) continue;
            
            let descripcion = '';
            const descElem = item.querySelector('description, summary, content');
            if (descElem) descripcion = descElem.textContent || '';
            descripcion = descripcion.replace(/<[^>]*>/g, '').trim().slice(0, 160);
            
            let pubDate = '';
            const dateElem = item.querySelector('pubDate, published, updated');
            if (dateElem) pubDate = dateElem.textContent;
            
            let imagen = '';
            const media = item.querySelector('media\\:content, content, enclosure');
            if (media) imagen = media.getAttribute('url') || media.getAttribute('src');
            if (!imagen) {
                const imgMatch = descripcion.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/i);
                if (imgMatch) imagen = imgMatch[0];
            }
            
            noticiasFuente.push({
                id: `${enlace}_${idx}`,
                titulo: titulo.slice(0, 100),
                enlace: enlace,
                descripcion: descripcion || titulo.slice(0, 100),
                imagen: imagen || `https://placehold.co/600x400/1e1e1e/667eea?text=${encodeURIComponent(nombreFuente.slice(0, 2))}`,
                fuente: nombreFuente,
                fecha: pubDate,
                timestamp: new Date(pubDate || Date.now()).getTime()
            });
        }
        
        console.log(`✅ ${nombreFuente} (RSS): ${noticiasFuente.length} noticias`);
        return noticiasFuente;
        
    } catch (error) {
        console.warn(`❌ ${nombreFuente} (RSS): ${error.message}`);
        return [];
    }
}

// 🔥 NUEVO: Obtener noticias (decide automáticamente el método)
async function obtenerNoticias(url, nombreFuente) {
    // Si parece RSS, usar método RSS
    if (esRssUrl(url)) {
        const noticias = await extraerDesdeRSS(url, nombreFuente);
        if (noticias.length > 0) return noticias;
        // Si falla RSS, intentar como HTML
        return await extraerDesdeHTML(url, nombreFuente);
    } 
    // Si es web normal, probar HTML primero
    else {
        const noticias = await extraerDesdeHTML(url, nombreFuente);
        if (noticias.length > 0) return noticias;
        // Si falla HTML, intentar buscar RSS automáticamente
        return await extraerDesdeRSS(url, nombreFuente);
    }
}

// Actualizar todas las fuentes en paralelo
async function actualizarTodo() {
    if (fuentes.length === 0) {
        mostrarMensaje('📌 Primero añade alguna fuente', true);
        return;
    }
    
    if (actualizando) {
        mostrarMensaje('⏳ Ya está actualizando...', true);
        return;
    }
    
    actualizando = true;
    const container = document.getElementById('newsContainer');
    container.innerHTML = '<div class="loading-state">🔄 Cargando ' + fuentes.length + ' fuentes...</div>';
    
    const promesas = fuentes.map(fuente => obtenerNoticias(fuente.url, fuente.nombre));
    const resultados = await Promise.all(promesas);
    
    let todasLasNoticias = [];
    const fuentesConNoticias = [];
    
    for (let i = 0; i < resultados.length; i++) {
        if (resultados[i].length > 0) {
            todasLasNoticias.push(...resultados[i]);
            fuentesConNoticias.push(fuentes[i].nombre);
        }
    }
    
    const fuentesFallidas = fuentes.filter(f => !fuentesConNoticias.includes(f.nombre));
    if (fuentesFallidas.length > 0) {
        const nombres = fuentesFallidas.map(f => f.nombre).join(', ');
        mostrarMensaje(`⚠️ Sin noticias: ${nombres}`, true);
    }
    
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
                if (Array.isArray(fuentesImportadas) && fuentesImportadas.every(f => f.nombre && f.url)) {
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

document.getElementById('addBtn').addEventListener('click', añadirFuente);
document.getElementById('refreshBtn').addEventListener('click', actualizarTodo);
document.getElementById('markReadBtn').addEventListener('click', marcarTodoLeido);
document.getElementById('clearReadBtn').addEventListener('click', limpiarLeidos);
document.getElementById('exportBtn').addEventListener('click', exportarFuentes);
document.getElementById('importBtn').addEventListener('click', importarFuentes);

cargarDatos();