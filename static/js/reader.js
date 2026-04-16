// app/static/js/reader.js

class CBZReader {
    constructor(chapterSlug) {
        this.chapterSlug = chapterSlug;
        this.currentPage = 1;
        this.totalPages = 0;
        this.viewMode = 'single'; // 'single' o 'double'
        this.loading = false;
        
        // Cache de imágenes
        this.imageCache = new Map();
        this.preloadRange = 2; // Precargar 2 páginas adelante/atrás
        
        this.init();
    }
    
    async init() {
        try {
            // Obtener información del capítulo
            const info = await this.fetchChapterInfo();
            this.totalPages = info.chapter.page_count;
            
            // Restaurar progreso si existe
            if (info.progress) {
                this.currentPage = info.progress.current_page;
            }
            
            // Configurar UI
            this.setupUI();
            this.setupControls();
            this.setupKeyboard();
            
            // Cargar página actual
            await this.displayPage(this.currentPage);
            
            // Precargar páginas cercanas
            this.preloadNearbyPages();
            
        } catch (error) {
            console.error('Error initializing reader:', error);
            this.showError('Error al cargar el capítulo');
        }
    }
    
    async fetchChapterInfo() {
        const response = await fetch(`/api/reader/${this.chapterSlug}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ get_progress: true })
        });
        
        if (!response.ok) {
            throw new Error('Error al obtener información del capítulo');
        }
        
        return await response.json();
    }
    
    async fetchPage(pageNumber) {
        // Si está en caché, retornar
        if (this.imageCache.has(pageNumber)) {
            return this.imageCache.get(pageNumber);
        }
        
        const response = await fetch(
            `/api/reader/${this.chapterSlug}/page/${pageNumber}`,
            { method: 'POST' }
        );
        
        if (!response.ok) {
            throw new Error(`Error al cargar página ${pageNumber}`);
        }
        
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        
        // Guardar en caché
        this.imageCache.set(pageNumber, imageUrl);
        
        return imageUrl;
    }
    
    async displayPage(pageNumber) {
        if (this.loading) return;
        
        this.loading = true;
        this.showLoading();
        
        try {
            const container = document.getElementById('page-container');
            container.innerHTML = '';
            
            if (this.viewMode === 'single') {
                // Modo una página
                const imageUrl = await this.fetchPage(pageNumber);
                const img = this.createImageElement(imageUrl, pageNumber);
                container.appendChild(img);
                
            } else {
                // Modo dos páginas
                const page1 = pageNumber;
                const page2 = pageNumber + 1;
                
                if (page1 <= this.totalPages) {
                    const url1 = await this.fetchPage(page1);
                    const img1 = this.createImageElement(url1, page1);
                    container.appendChild(img1);
                }
                
                if (page2 <= this.totalPages) {
                    const url2 = await this.fetchPage(page2);
                    const img2 = this.createImageElement(url2, page2);
                    container.appendChild(img2);
                }
            }
            
            this.currentPage = pageNumber;
            this.updateUI();
            this.saveProgress();
            this.preloadNearbyPages();
            
        } catch (error) {
            console.error('Error displaying page:', error);
            this.showError('Error al cargar la página');
        } finally {
            this.loading = false;
            this.hideLoading();
        }
    }
    
    createImageElement(src, pageNumber) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = `Página ${pageNumber}`;
        img.className = 'reader-page';
        img.loading = 'eager';
        return img;
    }
    
    async preloadNearbyPages() {
        const pagesToPreload = [];
        
        // Páginas adelante
        for (let i = 1; i <= this.preloadRange; i++) {
            const page = this.currentPage + i;
            if (page <= this.totalPages && !this.imageCache.has(page)) {
                pagesToPreload.push(page);
            }
        }
        
        // Páginas atrás
        for (let i = 1; i <= this.preloadRange; i++) {
            const page = this.currentPage - i;
            if (page >= 1 && !this.imageCache.has(page)) {
                pagesToPreload.push(page);
            }
        }
        
        // Precargar en segundo plano
        pagesToPreload.forEach(page => {
            this.fetchPage(page).catch(err => {
                console.warn(`Error preloading page ${page}:`, err);
            });
        });
    }
    
    async saveProgress() {
        try {
            await fetch(`/api/reader/${this.chapterSlug}/progress`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    current_page: this.currentPage,
                    total_pages: this.totalPages
                })
            });
        } catch (error) {
            console.error('Error saving progress:', error);
        }
    }
    
    setupUI() {
        // Actualizar información
        document.getElementById('page-info').textContent = 
            `Página ${this.currentPage} / ${this.totalPages}`;
    }
    
    updateUI() {
        document.getElementById('page-info').textContent = 
            `Página ${this.currentPage} / ${this.totalPages}`;
        
        // Actualizar botones
        document.getElementById('btn-prev').disabled = (this.currentPage === 1);
        document.getElementById('btn-next').disabled = (this.currentPage >= this.totalPages);
        
        // Actualizar input de página
        document.getElementById('page-input').value = this.currentPage;
    }
    
    setupControls() {
        // Botón anterior
        document.getElementById('btn-prev').addEventListener('click', () => {
            this.previousPage();
        });
        
        // Botón siguiente
        document.getElementById('btn-next').addEventListener('click', () => {
            this.nextPage();
        });
        
        // Cambiar modo de vista
        document.getElementById('btn-view-mode').addEventListener('click', () => {
            this.toggleViewMode();
        });
        
        // Ir a página específica
        document.getElementById('btn-go-page').addEventListener('click', () => {
            const input = document.getElementById('page-input');
            const page = parseInt(input.value);
            if (page >= 1 && page <= this.totalPages) {
                this.goToPage(page);
            }
        });
        
        // Enter en input de página
        document.getElementById('page-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('btn-go-page').click();
            }
        });
    }
    
    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    this.previousPage();
                    break;
                case 'ArrowRight':
                case 'd':
                case 'D':
                case ' ':
                    this.nextPage();
                    break;
                case 'Home':
                    this.goToPage(1);
                    break;
                case 'End':
                    this.goToPage(this.totalPages);
                    break;
            }
        });
    }
    
    previousPage() {
        const step = this.viewMode === 'double' ? 2 : 1;
        const newPage = Math.max(1, this.currentPage - step);
        this.displayPage(newPage);
    }
    
    nextPage() {
        const step = this.viewMode === 'double' ? 2 : 1;
        const newPage = Math.min(this.totalPages, this.currentPage + step);
        if (newPage !== this.currentPage) {
            this.displayPage(newPage);
        }
    }
    
    goToPage(page) {
        if (page >= 1 && page <= this.totalPages) {
            this.displayPage(page);
        }
    }
    
    toggleViewMode() {
        this.viewMode = this.viewMode === 'single' ? 'double' : 'single';
        
        const btn = document.getElementById('btn-view-mode');
        btn.textContent = this.viewMode === 'single' ? '📖 1 Página' : '📕 2 Páginas';
        
        this.displayPage(this.currentPage);
    }
    
    showLoading() {
        document.getElementById('loading-overlay').style.display = 'flex';
    }
    
    hideLoading() {
        document.getElementById('loading-overlay').style.display = 'none';
    }
    
    showError(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

// Inicializar cuando carga la página
document.addEventListener('DOMContentLoaded', () => {
    // Obtener slug del capítulo desde el atributo data
    const chapterSlug = document.getElementById('reader-app').dataset.chapterSlug;
    window.reader = new CBZReader(chapterSlug);
});