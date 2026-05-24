// ============================================
// ANDUIM RSS - LECTOR DE NOTICIAS
// Versión estable para GitHub Pages
// ============================================

// Claves de localStorage
const STORAGE_SOURCES = 'anduim_sources';
const STORAGE_ARTICLES = 'anduim_articles';
const STORAGE_READ = 'anduim_read';

// Estado global
let sources = [];
let allArticles = [];
let readArticleIds = new Set();

// Esperar a que el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 anduimRSS iniciado');
    
    // Cargar datos guardados
    loadData();
    
    // Configurar event listeners
    setupEventListeners();
    
    // Si no hay fuentes, mostrar ejemplo
    if (sources.length === 0) {
        addExampleSources();
    }
    
    // Si no hay noticias, mostrar las de ejemplo
    if (allArticles.length === 0) {
        loadExampleNews();
    }
});

function setupEventListeners() {
    // Botón añadir fuente
    const addBtn = document.getElementById('addSourceBtn');
    if (addBtn) {
        addBtn.addEventListener('click', addSource);
        console.log('✅ Botón añadir fuente configurado');
    } else {
        console.error('❌ No se encontró el botón addSourceBtn');
    }
    
    // Botón actualizar todas
    const fetchBtn = document.getElementById('fetchAllBtn');
    if (fetchBtn) {
        fetchBtn.addEventListener('click', fetchAllNews);
    }
    
    // Botón marcar todo leído
    const markBtn = document.getElementById('markAllReadBtn');
    if (markBtn) {
        markBtn.addEventListener('click', markAllRead);
    }
    
    // Botón limpiar leídos
    const clearBtn = document.getElementById('clearReadBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearReadNews);
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
        
        console.log(`📦 Cargados: ${sources.length} fuentes, ${allArticles.length} noticias`);
    } catch(e) {
        console.error('Error cargando datos:', e);
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
    const sourcesListDiv = document.getElementById('sourcesList');
    if (!sourcesListDiv) return;
    
    if (sources.length === 0) {
        sourcesListDiv.innerHTML = '<div style="color:#64748b; padding:10px;">➕ Añade tu primera URL usando el formulario de arriba</div>';
        return;
    }
    
    sourcesListDiv.innerHTML = sources.map((src, idx) => `
        <div class="source-tag">
            <span>📄 ${escapeHtml(src.name)}</span>
            <button data-index="${idx}" class="remove-source" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;">✖</button>
        </div>
    `).join('');
    
    // Event listeners para botones eliminar
    document.querySelectorAll('.remove-source').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index);
            removeSource(idx);
        });
    });
}

function removeSource(index) {
    if (confirm(`¿Eliminar la fuente "${sources[index].name}"?`)) {
        sources.splice(index, 1);
        saveSources();
        renderSources();
        // No borramos las noticias, pero el usuario puede actualizar
    }
}

function addSource() {
    console.log('➕ Añadiendo fuente...');
    
    const urlInput = document.getElementById('newSourceUrl');
    const nameInput = document.getElementById('newSourceName');
    
    if (!urlInput || !nameInput) {
        console.error('No se encontraron los inputs');
        return;
    }
    
    let url = urlInput.value.trim();
    let name = nameInput.value.trim();
    
    if (!url) {
        alert('Por favor, introduce una URL válida');
        return;
    }
    
    // Validar URL
    try {
        new URL(url);
    } catch(e) {
        alert('URL no válida. Ejemplo: https://www.ejemplo.com');
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
    renderSources();
    
    // Limpiar inputs
    urlInput.value = '';
    nameInput.value = '';
    
    // Mostrar mensaje
    alert(`✅ Fuente "${name}" añadida correctamente. Ahora pulsa "Actualizar todas" para cargar noticias.`);
    
    console.log(`Fuente añadida: ${name} (${url})`);
}

// Noticias de ejemplo (siempre disponibles)
function loadExampleNews() {
    const exampleNews = [
        {
            id: 'example-1',
            title: 'Bienvenido a anduimRSS - Tu agregador de noticias',
            link: '#',
            image: '',
            summary: 'Esta es una noticia de demostración. Añade fuentes reales y pulsa "Actualizar todas" para ver noticias reales.',
            sourceName: 'Demo',
            timestamp: Date.now()
        },
        {
            id: 'example-2',
            title: 'Cómo funciona anduimRSS',
            link: '#',
            image: '',
            summary: '1. Añade URLs de sitios de noticias. 2. Pulsa "Actualizar todas". 3. Las noticias aparecerán aquí. 4. Al leerlas se marcarán en gris.',
            sourceName: 'Demo',
            timestamp: Date.now() - 3600000
        },
        {
            id: 'example-3',
            title: 'Consejo: Prueba con estos sitios',
            link: '#',
            image: '',
            summary: 'Sitios recomendados: elpais.com, elmundo.es, 20minutos.es, xataka.com, microsiervos.com',
            sourceName: 'Demo',
            timestamp: Date.now() - 7200000
        }
    ];
    
    allArticles = exampleNews;
    saveArticles();
    renderNews();
}

function addExampleSources() {
    // Preguntar si quiere ejemplos
    setTimeout(() => {
        if (sources.length === 0) {
            const addExamples = confirm('¿Quieres añadir 2 fuentes de ejemplo para probar?\n\nPodrás eliminarlas después.');
            if (addExamples) {
                sources.push(
                    { url: 'https://www.elmundo.es', name: 'El Mundo' },
                    { url: 'https://www.20minutos.es', name: '20 Minutos' }
                );
                saveSources();
                renderSources();
                alert('✅ Fuentes de ejemplo añadidas. Ahora pulsa "Actualizar todas".');
            }
        }
    }, 1000);
}

async function fetchAllNews() {
    const fetchBtn = document.getElementById('fetchAllBtn');
    
    if (sources.length === 0) {
        alert('⚠️ No hay fuentes. Añade alguna URL primero.');
        return;
    }
    
    if (fetchBtn) {
        fetchBtn.disabled = true;
        fetchBtn.textContent = '⏳ Cargando...';
    }
    
    document.getElementById('newsList').innerHTML = '<div class="loading">🔍 Buscando noticias...<br><small>Esto puede tomar varios segundos</small></div>';
    
    let allNewArticles = [];
    
    for (const source of sources) {
        try {
            console.log(`Buscando en ${source.name}...`);
            const articles = await fetchFromSource(source);
            allNewArticles.push(...articles);
            // Pequeña pausa entre fuentes
            await new Promise(r => setTimeout(r, 500));
        } catch (error) {
            console.error(`Error con ${source.name}:`, error);
        }
    }
    
    // Eliminar duplicados
    const unique = [];
    const seen = new Set();
    for (const art of allNewArticles) {
        if (!seen.has(art.link)) {
            seen.add(art.link);
            unique.push(art);
        }
    }
    
    if (unique.length > 0) {
        allArticles = unique.sort((a,b) => b.timestamp - a.timestamp);
        saveArticles();
        renderNews();
    } else {
        // Si no se encontraron noticias reales, mantener las de ejemplo
        if (allArticles.length === 0) {
            loadExampleNews();
        }
        alert('⚠️ No se encontraron noticias en esas webs. Algunos sitios no permiten ser leídos. Sigue habiendo noticias de ejemplo.');
    }
    
    if (fetchBtn) {
        fetchBtn.disabled = false;
        fetchBtn.textContent = '🔄 Actualizar todas';
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
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const response = await fetch(proxy, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                html = data.contents || data;
                if (html && html.length > 500) break;
            }
        } catch (err) {
            continue;
        }
    }
    
    if (!html) return [];
    
    // Extraer artículos del HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const articles = [];
    
    // Buscar enlaces que parecen noticias
    const links = doc.querySelectorAll('a[href]');
    const keywords = ['noticia', 'articulo', 'article', 'post', 'story'];
    
    for (const link of links) {
        if (articles.length >= 10) break;
        
        const href = link.href;
        const text = link.innerText.trim();
        
        // Filtrar enlaces válidos
        if (!href || href.includes('#') || href.includes('javascript')) continue;
        if (text.length < 20 || text.length > 150) continue;
        if (href === source.url) continue;
        
        // Comprobar si parece una noticia
        let isNews = false;
        for (const kw of keywords) {
            if (href.toLowerCase().includes(kw) || text.toLowerCase().includes(kw)) {
                isNews = true;
                break;
            }
        }
        
        if (isNews || articles.length < 5) {
            // Buscar imagen
            let imgUrl = '';
            const parent = link.closest('article, div, li');
            if (parent) {
                const img = parent.querySelector('img');
                if (img && img.src) imgUrl = img.src;
            }
            
            articles.push({
                id: `${source.name}-${href}-${Date.now()}`,
                title: text.slice(0, 100),
                link: href,
                image: imgUrl,
                summary: text.slice(0, 150),
                sourceName: source.name,
                timestamp: Date.now() - (articles.length * 60000)
            });
        }
    }
    
    return articles.slice(0, 8);
}

function renderNews() {
    const newsListDiv = document.getElementById('newsList');
    if (!newsListDiv) return;
    
    if (allArticles.length === 0) {
        newsListDiv.innerHTML = '<div class="no-news">📭 Sin noticias. Pulsa "Actualizar todas" o añade fuentes.</div>';
        return;
    }
    
    newsListDiv.innerHTML = allArticles.map(article => `
        <div class="news-card ${readArticleIds.has(article.id) ? 'read' : ''}" data-id="${article.id}" data-link="${article.link}">
            ${article.image ? `<img class="news-img" src="${article.image}" alt="img" loading="lazy" onerror="this.style.display='none'">` : ''}
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
        card.addEventListener('click', function(e) {
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
                alert('Esta es una noticia de demostración. Añade fuentes reales para ver contenido.');
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