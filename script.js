// Claves de localStorage
const STORAGE_SOURCES = 'news_sources_v2';
const STORAGE_ARTICLES = 'news_articles_v2';
const STORAGE_READ = 'news_read_ids_v2';

// Estado
let sources = [];
let allArticles = [];
let readArticleIds = new Set();
let isLoading = false;

// DOM Elements
const sourcesListDiv = document.getElementById('sourcesList');
const newsListDiv = document.getElementById('newsList');
const newSourceUrlInput = document.getElementById('newSourceUrl');
const newSourceNameInput = document.getElementById('newSourceName');
const addSourceBtn = document.getElementById('addSourceBtn');
const fetchAllBtn = document.getElementById('fetchAllBtn');
const markAllReadBtn = document.getElementById('markAllReadBtn');
const clearReadBtn = document.getElementById('clearReadBtn');

// Cargar datos guardados
function loadData() {
    const savedSources = localStorage.getItem(STORAGE_SOURCES);
    if (savedSources) sources = JSON.parse(savedSources);
    
    const savedArticles = localStorage.getItem(STORAGE_ARTICLES);
    if (savedArticles) allArticles = JSON.parse(savedArticles);
    
    const savedRead = localStorage.getItem(STORAGE_READ);
    if (savedRead) readArticleIds = new Set(JSON.parse(savedRead));
    
    renderSources();
    renderNews();
    
    // Si no hay noticias y hay fuentes, auto-actualizar
    if (sources.length > 0 && allArticles.length === 0) {
        setTimeout(() => fetchAllNews(), 500);
    }
}

function saveSources() {
    localStorage.setItem(STORAGE_SOURCES, JSON.stringify(sources));
}

function saveArticles() {
    localStorage.setItem(STORAGE_ARTICLES, JSON.stringify(allArticles));
}

function saveReadIds() {
    localStorage.setItem(STORAGE_READ, JSON.stringify([...readArticleIds]));
}

function renderSources() {
    if (sources.length === 0) {
        sourcesListDiv.innerHTML = '<div style="color:#64748b">➕ Añade tu primera URL arriba</div>';
        return;
    }
    sourcesListDiv.innerHTML = sources.map((src, idx) => `
        <div class="source-tag">
            <span>📄 ${escapeHtml(src.name)}</span>
            <button data-index="${idx}" class="remove-source">✖</button>
        </div>
    `).join('');
    
    document.querySelectorAll('.remove-source').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.dataset.index);
            removeSource(idx);
        });
    });
}

function removeSource(index) {
    sources.splice(index, 1);
    saveSources();
    renderSources();
    allArticles = [];
    saveArticles();
    renderNews();
}

function addSource() {
    const url = newSourceUrlInput.value.trim();
    let name = newSourceNameInput.value.trim();
    if (!url) {
        alert('Por favor, introduce una URL válida');
        return;
    }
    
    try {
        new URL(url);
    } catch(e) {
        alert('URL no válida. Ejemplo: https://example.com');
        return;
    }
    
    if (!name) {
        try {
            name = new URL(url).hostname.replace('www.', '');
        } catch(e) {
            name = 'Fuente';
        }
    }
    
    sources.push({ url, name });
    saveSources();
    renderSources();
    newSourceUrlInput.value = '';
    newSourceNameInput.value = '';
    
    // Actualizar noticias automáticamente
    fetchAllNews();
}

async function fetchNewsFromSource(source) {
    // Múltiples proxies para redundancia
    const proxies = [
        `https://api.allorigins.win/get?url=${encodeURIComponent(source.url)}`,
        `https://corsproxy.io/?url=${encodeURIComponent(source.url)}`,
        `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(source.url)}`
    ];
    
    let html = null;
    let lastError = null;
    
    // Intentar con cada proxy hasta que uno funcione
    for (const proxy of proxies) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 segundos timeout
            
            const response = await fetch(proxy, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                html = data.contents || data;
                if (html && html.length > 1000) break;
            }
        } catch (err) {
            lastError = err;
            continue;
        }
    }
    
    if (!html) {
        console.error(`No se pudo cargar ${source.url}:`, lastError);
        return [];
    }
    
    // Extraer artículos
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const articles = [];
    const seenLinks = new Set();
    
    // Método 1: Buscar elementos que parecen artículos
    const selectors = [
        'article', '.post', '.entry', '.news-item', '.card', 
        '.noticia', '.story', '.item', '.article', '[role="article"]',
        '.blog-post', '.post-item', '.feed-item'
    ];
    
    let candidates = [];
    for (const selector of selectors) {
        candidates = doc.querySelectorAll(selector);
        if (candidates.length > 0) break;
    }
    
    if (candidates.length > 0) {
        candidates.forEach((el, idx) => {
            const link = el.querySelector('a[href]');
            if (!link) return;
            
            let urlLink = link.href;
            if (urlLink && !urlLink.startsWith('http')) {
                try {
                    urlLink = new URL(urlLink, source.url).href;
                } catch(e) { return; }
            }
            
            if (seenLinks.has(urlLink)) return;
            seenLinks.add(urlLink);
            
            // Título
            let title = '';
            const titleSelectors = ['h1', 'h2', 'h3', 'h4', '.title', '.headline', '.post-title'];
            for (const ts of titleSelectors) {
                const titleEl = el.querySelector(ts);
                if (titleEl && titleEl.innerText.trim().length > 5) {
                    title = titleEl.innerText.trim();
                    break;
                }
            }
            if (!title && link.innerText.trim().length > 5) title = link.innerText.trim();
            if (!title || title.length < 5) return;
            
            // Imagen
            let imgUrl = '';
            const img = el.querySelector('img');
            if (img && img.src) {
                imgUrl = img.src;
                if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
            }
            
            // Extracto
            let summary = '';
            const summarySelectors = ['p', '.excerpt', '.summary', '.description'];
            for (const ss of summarySelectors) {
                const p = el.querySelector(ss);
                if (p && p.innerText.trim().length > 30) {
                    summary = p.innerText.trim().slice(0, 200);
                    break;
                }
            }
            if (!summary && title) summary = title;
            
            articles.push({
                id: `${source.name}-${urlLink}-${Date.now()}`,
                title: title.slice(0, 100),
                link: urlLink,
                image: imgUrl,
                summary: summary.slice(0, 180),
                sourceName: source.name,
                timestamp: Date.now() - (idx * 3600000) // orden variado
            });
        });
    }
    
    // Método 2: Fallback - buscar enlaces con títulos grandes
    if (articles.length < 3) {
        const links = doc.querySelectorAll('a[href]');
        links.forEach((link, idx) => {
            if (articles.length >= 15) return;
            
            const text = link.innerText.trim();
            const hasImage = link.querySelector('img');
            const isProbablyArticle = text.length > 20 && text.length < 200 && !text.includes('●') && !text.includes('©');
            
            if (isProbablyArticle && !seenLinks.has(link.href)) {
                let urlLink = link.href;
                if (urlLink && !urlLink.startsWith('http')) {
                    try {
                        urlLink = new URL(urlLink, source.url).href;
                    } catch(e) { return; }
                }
                seenLinks.add(urlLink);
                
                let imgUrl = '';
                if (hasImage) {
                    const img = link.querySelector('img');
                    if (img && img.src) imgUrl = img.src;
                }
                
                articles.push({
                    id: `${source.name}-${urlLink}-${idx}`,
                    title: text.slice(0, 90),
                    link: urlLink,
                    image: imgUrl,
                    summary: text.slice(0, 150),
                    sourceName: source.name,
                    timestamp: Date.now() - (idx * 1800000)
                });
            }
        });
    }
    
    // Limitar por fuente
    return articles.slice(0, 12);
}

async function fetchAllNews() {
    if (isLoading) return;
    isLoading = true;
    fetchAllBtn.disabled = true;
    fetchAllBtn.textContent = '⏳ Cargando...';
    
    newsListDiv.innerHTML = '<div class="loading">🔍 Buscando noticias en todas las fuentes...<br><small>Esto puede tomar unos segundos</small></div>';
    
    let allNewArticles = [];
    
    for (const source of sources) {
        try {
            const articles = await fetchNewsFromSource(source);
            allNewArticles.push(...articles);
            await new Promise(r => setTimeout(r, 200));
        } catch (error) {
            console.error(`Error con ${source.name}:`, error);
        }
    }
    
    // Eliminar duplicados por link
    const unique = [];
    const seen = new Set();
    for (const art of allNewArticles) {
        if (!seen.has(art.link)) {
            seen.add(art.link);
            unique.push(art);
        }
    }
    
    if (unique.length === 0) {
        // Mostrar noticias de ejemplo si no hay resultados
        newsListDiv.innerHTML = '<div class="no-news">⚠️ No se encontraron noticias. Prueba con otra web (ej: un blog o medio de noticias).<br><br>📌 Ejemplo: https://www.elmundo.es</div>';
    } else {
        allArticles = unique.sort((a,b) => b.timestamp - a.timestamp);
        saveArticles();
        renderNews();
    }
    
    isLoading = false;
    fetchAllBtn.disabled = false;
    fetchAllBtn.textContent = '🔄 Actualizar todas';
}

function renderNews() {
    if (allArticles.length === 0) {
        newsListDiv.innerHTML = '<div class="no-news">📭 Sin noticias. Añade fuentes y pulsa "Actualizar todas".</div>';
        return;
    }
    
    newsListDiv.innerHTML = allArticles.map(article => `
        <div class="news-card ${readArticleIds.has(article.id) ? 'read' : ''}" data-id="${article.id}" data-link="${article.link}">
            ${article.image ? `<img class="news-img" src="${article.image}" alt="img" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">` : ''}
            <div class="news-img" style="background:#e2e8f0; display:${article.image ? 'none' : 'flex'}; align-items:center; justify-content:center; font-size:2rem;">
                📰
            </div>
            <div class="news-content">
                <div class="news-title">${escapeHtml(article.title)}</div>
                <div class="news-summary">${escapeHtml(article.summary)}</div>
                <div class="news-source">📌 ${escapeHtml(article.sourceName)}</div>
            </div>
        </div>
    `).join('');
    
    // Event listeners
    document.querySelectorAll('.news-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const id = card.dataset.id;
            const link = card.dataset.link;
            if (link) {
                if (!readArticleIds.has(id)) {
                    readArticleIds.add(id);
                    saveReadIds();
                    card.classList.add('read');
                }
                window.open(link, '_blank');
            }
        });
    });
}

function markAllRead() {
    allArticles.forEach(art => readArticleIds.add(art.id));
    saveReadIds();
    renderNews();
}

function clearReadNews() {
    allArticles = allArticles.filter(art => !readArticleIds.has(art.id));
    readArticleIds.clear();
    saveArticles();
    saveReadIds();
    renderNews();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Event listeners
addSourceBtn.addEventListener('click', addSource);
fetchAllBtn.addEventListener('click', fetchAllNews);
markAllReadBtn.addEventListener('click', markAllRead);
clearReadBtn.addEventListener('click', clearReadNews);

// Inicializar
loadData();

// Añadir fuentes de ejemplo si está vacío (para pruebas)
if (sources.length === 0) {
    setTimeout(() => {
        if (confirm('¿Quieres añadir 2 fuentes de ejemplo para probar?')) {
            sources.push(
                { url: 'https://www.elmundo.es', name: 'El Mundo' },
                { url: 'https://www.20minutos.es', name: '20 Minutos' }
            );
            saveSources();
            renderSources();
            fetchAllNews();
        }
    }, 500);
}
