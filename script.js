// Storage keys
const STORAGE_SOURCES = 'newsflow_sources';
const STORAGE_ARTICLES = 'newsflow_articles';
const STORAGE_READ = 'newsflow_read';

let sources = [];
let allArticles = [];
let readIds = new Set();

// DOM elements
const sourcesListDiv = document.getElementById('sourcesList');
const newsListDiv = document.getElementById('newsList');
const newSourceUrl = document.getElementById('newSourceUrl');
const newSourceName = document.getElementById('newSourceName');
const addSourceBtn = document.getElementById('addSourceBtn');
const fetchAllBtn = document.getElementById('fetchAllBtn');
const markAllReadBtn = document.getElementById('markAllReadBtn');
const clearReadBtn = document.getElementById('clearReadBtn');
const modal = document.getElementById('addModal');
const newsCountSpan = document.getElementById('newsCount');

// Load saved data
function loadData() {
    const savedSources = localStorage.getItem(STORAGE_SOURCES);
    if (savedSources) sources = JSON.parse(savedSources);
    
    const savedArticles = localStorage.getItem(STORAGE_ARTICLES);
    if (savedArticles) allArticles = JSON.parse(savedArticles);
    
    const savedRead = localStorage.getItem(STORAGE_READ);
    if (savedRead) readIds = new Set(JSON.parse(savedRead));
    
    renderSources();
    renderNews();
}

// Save functions
function saveSources() { localStorage.setItem(STORAGE_SOURCES, JSON.stringify(sources)); }
function saveArticles() { localStorage.setItem(STORAGE_ARTICLES, JSON.stringify(allArticles)); }
function saveReadIds() { localStorage.setItem(STORAGE_READ, JSON.stringify([...readIds])); }

// Render sources in sidebar
function renderSources() {
    if (sources.length === 0) {
        sourcesListDiv.innerHTML = '<div class="empty-state-small"><i class="fas fa-plus-circle"></i><br>Añade tu primera fuente</div>';
        return;
    }
    
    sourcesListDiv.innerHTML = sources.map((src, idx) => `
        <div class="source-item">
            <span class="source-name"><i class="fas fa-globe"></i> ${escapeHtml(src.name)}</span>
            <button class="remove-source" data-index="${idx}"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');
    
    document.querySelectorAll('.remove-source').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.dataset.index);
            sources.splice(idx, 1);
            saveSources();
            renderSources();
            allArticles = allArticles.filter(art => !sources.some(s => s.name === art.sourceName));
            saveArticles();
            renderNews();
        });
    });
}

// Improved news extraction
async function extractNewsFromUrl(source) {
    const proxyUrls = [
        `https://api.allorigins.win/get?url=${encodeURIComponent(source.url)}`,
        `https://cors-anywhere.herokuapp.com/${source.url}`
    ];
    
    for (const proxyUrl of proxyUrls) {
        try {
            const response = await fetch(proxyUrl);
            const data = await response.json();
            const html = data.contents || data;
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const articles = [];
            
            // Estrategias de extracción mejoradas
            const selectors = [
                'article', '.article', '.news-item', '.story', '.post',
                '.node', '.item-list', '.list-item', '.card', '.noticia',
                '[data-article]', '.entry', '.feed-item'
            ];
            
            let items = [];
            for (const selector of selectors) {
                const found = doc.querySelectorAll(selector);
                if (found.length > 0) {
                    items = found;
                    break;
                }
            }
            
            if (items.length === 0) {
                // Fallback: buscar enlaces con títulos
                const links = doc.querySelectorAll('a');
                items = Array.from(links).filter(link => {
                    const text = link.innerText.trim();
                    return text.length > 20 && text.length < 200 && link.href;
                });
            }
            
            items.forEach((item, idx) => {
                // Extraer título
                let title = '';
                const titleSelectors = ['h1', 'h2', 'h3', 'h4', '.title', '.headline', '.heading'];
                for (const sel of titleSelectors) {
                    const titleElem = item.querySelector(sel);
                    if (titleElem && titleElem.innerText.trim().length > 10) {
                        title = titleElem.innerText.trim();
                        break;
                    }
                }
                if (!title && item.innerText) title = item.innerText.trim().slice(0, 100);
                
                // Extraer enlace
                let link = '';
                const linkElem = item.querySelector('a');
                if (linkElem && linkElem.href) link = linkElem.href;
                else if (item.href) link = item.href;
                if (link && !link.startsWith('http')) link = new URL(link, source.url).href;
                
                // Extraer imagen
                let image = '';
                const imgElem = item.querySelector('img');
                if (imgElem && imgElem.src) image = imgElem.src;
                if (image && !image.startsWith('http')) image = new URL(image, source.url).href;
                
                // Extraer resumen
                let summary = '';
                const summarySelectors = ['.summary', '.description', '.excerpt', 'p'];
                for (const sel of summarySelectors) {
                    const sumElem = item.querySelector(sel);
                    if (sumElem && sumElem.innerText.trim().length > 20) {
                        summary = sumElem.innerText.trim().slice(0, 200);
                        break;
                    }
                }
                if (!summary && title) summary = title;
                
                if (title && link && title.length > 15) {
                    articles.push({
                        id: `${source.name}-${idx}-${Date.now()}-${Math.random()}`,
                        title: title,
                        link: link,
                        image: image || 'https://placehold.co/600x400/1e293b/3b82f6?text=Noticia',
                        summary: summary.slice(0, 200),
                        sourceName: source.name,
                        timestamp: Date.now()
                    });
                }
            });
            
            return articles.slice(0, 15);
        } catch (error) {
            console.error(`Error con proxy para ${source.url}:`, error);
            continue;
        }
    }
    return [];
}

// Fetch all news
async function fetchAllNews() {
    if (sources.length === 0) {
        alert('Primero añade alguna fuente de noticias');
        return;
    }
    
    newsListDiv.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Extrayendo noticias de todas las fuentes...</p></div>';
    
    let allNewArticles = [];
    
    for (const source of sources) {
        const articles = await extractNewsFromUrl(source);
        allNewArticles.push(...articles);
        await new Promise(r => setTimeout(r, 500)); // Delay entre fuentes
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
    
    allArticles = unique.sort((a, b) => b.timestamp - a.timestamp);
    saveArticles();
    renderNews();
}

// Render news grid
function renderNews() {
    if (allArticles.length === 0) {
        newsListDiv.innerHTML = '<div class="loading-state"><i class="fas fa-newspaper"></i><p>No hay noticias. Haz clic en "Actualizar todo"</p></div>';
        newsCountSpan.textContent = '0 noticias';
        return;
    }
    
    const unreadCount = allArticles.filter(art => !readIds.has(art.id)).length;
    newsCountSpan.textContent = `${unreadCount} noticias nuevas`;
    
    newsListDiv.innerHTML = allArticles.map(article => `
        <div class="news-card ${readIds.has(article.id) ? 'read' : ''}" data-id="${article.id}" data-link="${article.link}">
            <img class="news-img" src="${article.image}" alt="${escapeHtml(article.title)}" onerror="this.src='https://placehold.co/600x400/1e293b/3b82f6?text=📰'">
            <div class="news-content">
                <div class="news-title">${escapeHtml(article.title)}</div>
                <div class="news-summary">${escapeHtml(article.summary)}</div>
                <div class="news-meta">
                    <span class="news-source"><i class="fas fa-globe"></i> ${escapeHtml(article.sourceName)}</span>
                    <span class="news-date"><i class="far fa-clock"></i> ${new Date(article.timestamp).toLocaleTimeString()}</span>
                </div>
            </div>
        </div>
    `).join('');
    
    // Add click handlers
    document.querySelectorAll('.news-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const id = card.dataset.id;
            const link = card.dataset.link;
            if (link) {
                if (!readIds.has(id)) {
                    readIds.add(id);
                    saveReadIds();
                    card.classList.add('read');
                    renderNews(); // Refresh counter
                }
                window.open(link, '_blank');
            }
        });
    });
}

function markAllRead() {
    allArticles.forEach(art => readIds.add(art.id));
    saveReadIds();
    renderNews();
}

function clearReadNews() {
    allArticles = allArticles.filter(art => !readIds.has(art.id));
    readIds.clear();
    saveArticles();
    saveReadIds();
    renderNews();
}

function addSource() {
    const url = newSourceUrl.value.trim();
    let name = newSourceName.value.trim();
    
    if (!url) {
        alert('Por favor, introduce una URL');
        return;
    }
    
    if (!name) {
        try {
            name = new URL(url).hostname.replace('www.', '').split('.')[0];
        } catch(e) {
            name = 'Fuente';
        }
    }
    
    sources.push({ url, name });
    saveSources();
    renderSources();
    
    // Clear modal inputs
    newSourceUrl.value = '';
    newSourceName.value = '';
    modal.style.display = 'none';
    
    // Optional: auto-fetch
    if (confirm('¿Quieres actualizar las noticias ahora?')) {
        fetchAllNews();
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Modal handling
const addSourceBtnMobile = document.getElementById('addSourceBtnMobile');
if (addSourceBtnMobile) {
    addSourceBtnMobile.onclick = () => modal.style.display = 'block';
}
addSourceBtn.onclick = addSource;
document.querySelector('.close').onclick = () => modal.style.display = 'none';
window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

// Event listeners
fetchAllBtn.onclick = fetchAllNews;
markAllReadBtn.onclick = markAllRead;
clearReadBtn.onclick = clearReadNews;

// Initialize
loadData();