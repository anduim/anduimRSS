// Claves de localStorage
const STORAGE_SOURCES = 'news_sources';
const STORAGE_ARTICLES = 'news_articles';
const STORAGE_READ = 'news_read_ids';

// Estado
let sources = [];
let allArticles = [];
let readArticleIds = new Set();

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
        sourcesListDiv.innerHTML = '<div style="color:#64748b">No hay fuentes. Añade alguna URL.</div>';
        return;
    }
    sourcesListDiv.innerHTML = sources.map((src, idx) => `
        <div class="source-tag">
            <span>📄 ${src.name}</span>
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
    // Opcional: limpiar artículos de esa fuente (o dejarlos, pero se mezclan)
    // Para simplificar, pedimos al usuario re-actualizar
    allArticles = [];
    saveArticles();
    renderNews();
}

function addSource() {
    const url = newSourceUrlInput.value.trim();
    let name = newSourceNameInput.value.trim();
    if (!url) return;
    if (!name) name = new URL(url).hostname;
    
    sources.push({ url, name });
    saveSources();
    renderSources();
    newSourceUrlInput.value = '';
    newSourceNameInput.value = '';
    
    // Opcional: auto-fetch esta fuente
}

async function fetchNewsFromSource(source) {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(source.url)}`;
    try {
        const response = await fetch(proxyUrl);
        const data = await response.json();
        const html = data.contents;
        
        // Extraer noticias: buscamos etiquetas <a> grandes o artículos
        // Método simplificado: busca todos los enlaces y coge título + posible img
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Buscar artículos (por common selectors)
        const articles = [];
        const possibleArticles = doc.querySelectorAll('article, .post, .news-item, .entry, .card, .noticia');
        
        if (possibleArticles.length > 0) {
            possibleArticles.forEach((el, idx) => {
                const link = el.querySelector('a');
                const titleEl = el.querySelector('h1, h2, h3, .title, .headline');
                const imgEl = el.querySelector('img');
                let title = titleEl ? titleEl.innerText.trim() : (link ? link.innerText.trim() : 'Sin título');
                let urlLink = link ? link.href : '';
                if (urlLink && !urlLink.startsWith('http')) urlLink = new URL(urlLink, source.url).href;
                let imgUrl = imgEl ? imgEl.src : '';
                let summary = el.innerText.slice(0, 150).trim();
                
                if (title && urlLink && title.length > 5) {
                    articles.push({
                        id: `${source.name}-${idx}-${Date.now()}`,
                        title,
                        link: urlLink,
                        image: imgUrl,
                        summary: summary || title,
                        sourceName: source.name,
                        timestamp: Date.now()
                    });
                }
            });
        }
        
        // Fallback: buscar enlaces con títulos prominentes
        if (articles.length === 0) {
            const headings = doc.querySelectorAll('a h1, a h2, a h3, a .title');
            headings.forEach((heading, idx) => {
                const parentLink = heading.closest('a');
                if (parentLink && parentLink.href) {
                    articles.push({
                        id: `${source.name}-${idx}`,
                        title: heading.innerText.trim(),
                        link: parentLink.href,
                        image: '',
                        summary: heading.innerText.trim().slice(0, 150),
                        sourceName: source.name,
                        timestamp: Date.now()
                    });
                }
            });
        }
        
        return articles.slice(0, 12); // máx 12 por fuente
    } catch (error) {
        console.error(`Error fetching ${source.url}:`, error);
        return [];
    }
}

async function fetchAllNews() {
    newsListDiv.innerHTML = '<div class="loading">🔄 Cargando noticias desde todas las fuentes...</div>';
    let allNewArticles = [];
    
    for (const source of sources) {
        const articles = await fetchNewsFromSource(source);
        allNewArticles.push(...articles);
        // pequeño delay para no bloquear
        await new Promise(r => setTimeout(r, 300));
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
    
    allArticles = unique.sort((a,b) => b.timestamp - a.timestamp);
    saveArticles();
    renderNews();
}

function renderNews() {
    if (allArticles.length === 0) {
        newsListDiv.innerHTML = '<div class="no-news">📭 No hay noticias. Añade fuentes y pulsa "Actualizar todas".</div>';
        return;
    }
    
    newsListDiv.innerHTML = allArticles.map(article => `
        <div class="news-card ${readArticleIds.has(article.id) ? 'read' : ''}" data-id="${article.id}" data-link="${article.link}">
            ${article.image ? `<img class="news-img" src="${article.image}" alt="img" loading="lazy" onerror="this.src='https://placehold.co/600x400?text=Sin+imagen'">` : '<div class="news-img" style="background:#e2e8f0; display:flex; align-items:center; justify-content:center;">📰</div>'}
            <div class="news-content">
                <div class="news-title">${escapeHtml(article.title)}</div>
                <div class="news-summary">${escapeHtml(article.summary)}</div>
                <div class="news-source">📌 ${escapeHtml(article.sourceName)}</div>
            </div>
        </div>
    `).join('');
    
    // Event listeners a cada tarjeta
    document.querySelectorAll('.news-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const id = card.dataset.id;
            const link = card.dataset.link;
            if (link) {
                // Marcar como leída antes de abrir
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