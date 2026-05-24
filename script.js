// ============================================
// ANDUIM RSS - VERSIÓN ESTABLE
// ============================================

// Claves de localStorage
const STORAGE_SOURCES = 'anduim_sources';
const STORAGE_ARTICLES = 'anduim_articles';
const STORAGE_READ = 'anduim_read';

// Estado
let sources = [];
let allArticles = [];
let readArticleIds = new Set();

// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 App iniciada');
    
    // Cargar datos guardados
    loadData();
    
    // Configurar botones
    setupButtons();
    
    // Si no hay noticias, mostrar demo
    if (allArticles.length === 0) {
        loadDemoNews();
    }
});

function setupButtons() {
    // Botón añadir fuente
    const addBtn = document.getElementById('addSourceBtn');
    if (addBtn) {
        addBtn.onclick = function(e) {
            e.preventDefault();
            addSource();
        };
        console.log('✅ Botón añadir configurado');
    }
    
    // Botón actualizar todas
    const fetchBtn = document.getElementById('fetchAllBtn');
    if (fetchBtn) {
        fetchBtn.onclick = function() { fetchAllNews(); };
    }
    
    // Botón marcar todo leído
    const markBtn = document.getElementById('markAllReadBtn');
    if (markBtn) {
        markBtn.onclick = function() { markAllRead(); };
    }
    
    // Botón limpiar leídos
    const clearBtn = document.getElementById('clearReadBtn');
    if (clearBtn) {
        clearBtn.onclick = function() { clearReadNews(); };
    }
}

function loadData() {
    try {
        const savedSources = localStorage.getItem(STORAGE_SOURCES);
        if (savedSources) sources = JSON.parse(savedSources);
        
        const savedArticles = localStorage.getItem(STORAGE_ARTICLES);
        if (savedArticles) allArticles = JSON.parse(savedArticles);
        
        const savedRead = localStorage.getItem(STORAGE_READ);
        if (savedRead) readArticleIds = new Set(JSON.parse(savedRead));
    } catch(e) {
        console.error('Error cargando:', e);
    }
    
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
    const container = document.getElementById('sourcesList');
    if (!container) return;
    
    if (sources.length === 0) {
        container.innerHTML = '<div style="color:#64748b">➕ Añade tu primera URL</div>';
        return;
    }
    
    container.innerHTML = sources.map((src, idx) => `
        <div class="source-tag">
            <span>📄 ${escapeHtml(src.name)}</span>
            <button data-index="${idx}" class="remove-source">✖</button>
        </div>
    `).join('');
    
    // Eventos para eliminar
    document.querySelectorAll('.remove-source').forEach(btn => {
        btn.onclick = function(e) {
            e.stopPropagation();
            const idx = parseInt(this.dataset.index);
            if (confirm('¿Eliminar esta fuente?')) {
                sources.splice(idx, 1);
                saveSources();
                renderSources();
            }
        };
    });
}

function addSource() {
    console.log('➕ addSource() ejecutado');
    
    const urlInput = document.getElementById('newSourceUrl');
    const nameInput = document.getElementById('newSourceName');
    
    if (!urlInput || !nameInput) {
        console.error('No se encontraron inputs');
        return;
    }
    
    let url = urlInput.value.trim();
    let name = nameInput.value.trim();
    
    if (!url) {
        alert('❌ Introduce una URL');
        return;
    }
    
    // Añadir https si falta
    if (!url.startsWith('http')) {
        url = 'https://' + url;
    }
    
    // Validar URL
    try {
        new URL(url);
    } catch(e) {
        alert('❌ URL no válida');
        return;
    }
    
    // Si no hay nombre, usar el dominio
    if (!name) {
        try {
            name = new URL(url).hostname.replace('www.', '');
        } catch(e) {
            name = 'Mi fuente';
        }
    }
    
    // Añadir fuente
    sources.push({ url, name });
    saveSources();
    
    // Limpiar inputs
    urlInput.value = '';
    nameInput.value = '';
    
    // Actualizar UI
    renderSources();
    
    alert(`✅ Fuente "${name}" añadida`);
    console.log('Fuentes actuales:', sources);
}

function loadDemoNews() {
    allArticles = [
        {
            id: 'demo1',
            title: '🎉 Bienvenido a anduimRSS',
            summary: 'Este es tu agregador de noticias. Añade fuentes reales y pulsa "Actualizar todas".',
            link: '#',
            image: '',
            sourceName: 'Demo',
            timestamp: Date.now()
        },
        {
            id: 'demo2',
            title: '📌 Cómo funciona',
            summary: '1. Añade URLs de sitios de noticias. 2. Pulsa "Actualizar todas". 3. Las noticias aparecerán aquí.',
            link: '#',
            image: '',
            sourceName: 'Demo',
            timestamp: Date.now() - 3600000
        },
        {
            id: 'demo3',
            title: '🔍 Sitios recomendados para probar',
            summary: 'elmundo.es, 20minutos.es, abc.es, xataka.com',
            link: '#',
            image: '',
            sourceName: 'Demo',
            timestamp: Date.now() - 7200000
        }
    ];
    saveArticles();
    renderNews();
}

async function fetchAllNews() {
    if (sources.length === 0) {
        alert('⚠️ No hay fuentes. Añade alguna primero.');
        return;
    }
    
    const newsDiv = document.getElementById('newsList');
    newsDiv.innerHTML = '<div class="loading">🔄 Buscando noticias...<br><small>Puede tardar varios segundos</small></div>';
    
    let allNewArticles = [];
    
    for (const source of sources) {
        try {
            const articles = await fetchFromSource(source);
            allNewArticles.push(...articles);
            await delay(500);
        } catch(e) {
            console.error('Error con', source.name, e);
        }
    }
    
    if (allNewArticles.length > 0) {
        // Eliminar duplicados por enlace
        const unique = [];
        const seen = new Set();
        for (const art of allNewArticles) {
            if (!seen.has(art.link)) {
                seen.add(art.link);
                unique.push(art);
            }
        }
        allArticles = unique.slice(0, 30);
        saveArticles();
        renderNews();
        alert(`✅ ${allArticles.length} noticias encontradas`);
    } else {
        if (allArticles.length === 0) {
            loadDemoNews();
        }
        alert('⚠️ No se encontraron noticias. Siguen las noticias de demo.');
    }
}

async function fetchFromSource(source) {
    const proxies = [
        `https://api.allorigins.win/get?url=${encodeURIComponent(source.url)}`,
        `https://corsproxy.io/?url=${encodeURIComponent(source.url)}`
    ];
    
    let html = null;
    for (const proxy of proxies) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            const res = await fetch(proxy, { signal: controller.signal });
            clearTimeout(timeout);
            
            if (res.ok) {
                const data = await res.json();
                html = data.contents || data;
                if (html && html.length > 500) break;
            }
        } catch(e) {}
    }
    
    if (!html) return [];
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const articles = [];
    const links = doc.querySelectorAll('a[href]');
    
    for (const link of links) {
        if (articles.length >= 10) break;
        
        const href = link.href;
        const text = link.innerText.trim();
        
        if (!href || href.includes('#') || href === source.url) continue;
        if (text.length < 20 || text.length > 150) continue;
        
        // Buscar imagen
        let image = '';
        const parent = link.closest('article, div, li');
        if (parent) {
            const img = parent.querySelector('img');
            if (img && img.src) image = img.src;
        }
        
        articles.push({
            id: `${source.name}-${href}-${Date.now()}`,
            title: text.slice(0, 90),
            summary: text.slice(0, 140),
            link: href,
            image: image,
            sourceName: source.name,
            timestamp: Date.now()
        });
    }
    
    return articles;
}

function renderNews() {
    const container = document.getElementById('newsList');
    if (!container) return;
    
    if (allArticles.length === 0) {
        container.innerHTML = '<div class="no-news">📭 Sin noticias. Pulsa "Actualizar todas"</div>';
        return;
    }
    
    container.innerHTML = allArticles.map(article => `
        <div class="news-card ${readArticleIds.has(article.id) ? 'read' : ''}" data-id="${article.id}" data-link="${article.link}">
            <div class="news-img">
                ${article.image ? `<img src="${article.image}" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentElement.innerHTML='📰'">` : '📰'}
            </div>
            <div class="news-content">
                <div class="news-title">${escapeHtml(article.title)}</div>
                <div class="news-summary">${escapeHtml(article.summary)}</div>
                <div class="news-source">📌 ${escapeHtml(article.sourceName)}</div>
            </div>
        </div>
    `).join('');
    
    // Eventos clic en noticias
    document.querySelectorAll('.news-card').forEach(card => {
        card.onclick = function() {
            const id = this.dataset.id;
            const link = this.dataset.link;
            
            if (link && link !== '#') {
                if (!readArticleIds.has(id)) {
                    readArticleIds.add(id);
                    saveReadIds();
                    this.classList.add('read');
                }
                window.open(link, '_blank');
            } else if (link === '#') {
                alert('ℹ️ Noticia de demostración. Añade fuentes reales.');
            }
        };
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

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}