// app.js
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Toast System
    window.showToast = (message, isError = false) => {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        if (isError) toast.style.borderLeft = '4px solid var(--danger)';
        else toast.style.borderLeft = '4px solid var(--primary)';
        
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    // 2. Initialize Managers
    const mapManager = new window.MapManager();
    const layerManager = new window.LayerManager(mapManager);
    window.layerManager = layerManager; // Expose globally for importer
    const geojsonImporter = new window.GeoJsonImporter();

    // 3. UI Setup
    setupUI(mapManager, layerManager);
    setupPasswordGate(mapManager);
});

function setupPasswordGate(mapManager) {
    const loader = document.getElementById('loading-screen');
    const passwordScreen = document.getElementById('password-screen');
    const app = document.getElementById('app');
    
    const passwordInput = document.getElementById('password-input-field');
    const passwordSubmit = document.getElementById('password-submit');
    const passwordToggleVisibility = document.getElementById('password-toggle-visibility');
    const eyeIcon = document.getElementById('eye-icon');
    const passwordError = document.getElementById('password-error');
    
    const CORRECT_PASSWORD = 'yassine0902008';
    
    // Check if already authenticated in this session
    const isAuth = sessionStorage.getItem('geosync_auth') === 'true';
    
    setTimeout(() => {
        if (isAuth) {
            // Already authenticated, directly show the app
            if (loader && app) {
                loader.style.opacity = '0';
                setTimeout(() => {
                    loader.style.display = 'none';
                    app.classList.remove('hidden');
                    mapManager.map.invalidateSize();
                }, 500);
            }
        } else {
            // Show password screen
            if (loader && passwordScreen) {
                loader.style.opacity = '0';
                setTimeout(() => {
                    loader.style.display = 'none';
                    passwordScreen.classList.remove('hidden');
                    passwordInput?.focus();
                }, 500);
            }
        }
    }, 1000);
    
    // Toggle password visibility
    passwordToggleVisibility?.addEventListener('click', () => {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            eyeIcon.innerHTML = `
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" x2="23" y1="1" y2="23"/>
            `;
        } else {
            passwordInput.type = 'password';
            eyeIcon.innerHTML = `
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
            `;
        }
    });
    
    // Submit password function
    const submitPassword = () => {
        const entered = passwordInput?.value;
        if (entered === CORRECT_PASSWORD) {
            sessionStorage.setItem('geosync_auth', 'true');
            passwordError?.classList.remove('visible');
            
            // Success animation
            passwordScreen.classList.add('hidden');
            setTimeout(() => {
                app?.classList.remove('hidden');
                mapManager.map.invalidateSize();
            }, 500);
        } else {
            // Show error
            passwordError?.classList.add('visible');
            
            // Shake effect
            const card = document.querySelector('.password-card');
            if (card) {
                card.style.animation = 'none';
                void card.offsetWidth; // Trigger reflow
                card.style.animation = 'shake 0.4s ease-in-out';
            }
            passwordInput?.focus();
            passwordInput?.select();
        }
    };
    
    passwordSubmit?.addEventListener('click', submitPassword);
    passwordInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            submitPassword();
        }
    });
}

function setupUI(mapManager, layerManager) {
    // Sidebar Toggle
    const sidebar = document.getElementById('sidebar');
    const closeBtn = document.getElementById('sidebar-close-btn');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    
    closeBtn?.addEventListener('click', () => sidebar?.classList.add('closed'));
    toggleBtn?.addEventListener('click', () => sidebar?.classList.toggle('closed'));

    // Marker Mode
    const addMarkerBtn = document.getElementById('add-marker-btn');
    const cancelMarkerBtn = document.getElementById('cancel-marker-mode');
    
    addMarkerBtn?.addEventListener('click', () => {
        mapManager.enableMarkerMode();
    });
    cancelMarkerBtn?.addEventListener('click', () => {
        mapManager.disableMarkerMode();
    });

    // Listen for map click to add marker
    window.addEventListener('map:addMarker', (e) => {
        const latlng = e.detail.latlng;
        // Open modal for new marker
        openMarkerModal(null, latlng.lat, latlng.lng, layerManager);
    });

    // Modals setup
    setupModals(layerManager);

    // UI Updates
    window.addEventListener('layersUpdated', (e) => {
        updateLayersList(e.detail.layers, layerManager);
    });

    window.addEventListener('markersUpdated', (e) => {
        updateMarkersList(e.detail.markers, layerManager);
    });

    // Search input (basic dummy implementation)
    const searchInput = document.getElementById('search-input');
    searchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            window.showToast('Search functionality requires a geocoding service API key');
        }
    });
}

function setupModals(layerManager) {
    // Marker Modal
    const markerModal = document.getElementById('marker-modal');
    const closeMarkerBtn = document.getElementById('close-marker-modal');
    const saveMarkerBtn = document.getElementById('save-marker-btn');
    const delMarkerBtn = document.getElementById('delete-marker-btn');
    
    let currentMarkerId = null;
    let currentMarkerLatLng = null;

    window.openMarkerModal = (id, lat = null, lng = null) => {
        currentMarkerId = id;
        currentMarkerLatLng = {lat, lng};
        
        const titleInput = document.getElementById('marker-title-input');
        const descInput = document.getElementById('marker-desc-input');
        
        if (id) {
            // Edit existing
            const marker = layerManager.markers.get(id);
            if (marker) {
                titleInput.value = marker.title || '';
                descInput.value = marker.description || '';
                delMarkerBtn.style.display = 'flex';
            }
        } else {
            // New marker
            titleInput.value = '';
            descInput.value = '';
            delMarkerBtn.style.display = 'none';
        }
        
        markerModal.classList.remove('hidden');
    };

    closeMarkerBtn?.addEventListener('click', () => markerModal.classList.add('hidden'));
    
    saveMarkerBtn?.addEventListener('click', async () => {
        const title = document.getElementById('marker-title-input').value;
        const desc = document.getElementById('marker-desc-input').value;
        
        if (currentMarkerId) {
            await layerManager.updateMarker(currentMarkerId, title, desc);
            window.showToast(window.i18n.t('toast_marker_updated'));
        } else if (currentMarkerLatLng) {
            await layerManager.addMarker(currentMarkerLatLng.lat, currentMarkerLatLng.lng, title, desc);
            window.showToast(window.i18n.t('toast_marker_added'));
        }
        markerModal.classList.add('hidden');
    });

    delMarkerBtn?.addEventListener('click', async () => {
        if (currentMarkerId) {
            await layerManager.deleteMarker(currentMarkerId);
            window.showToast(window.i18n.t('toast_marker_deleted'));
            markerModal.classList.add('hidden');
        }
    });

    window.addEventListener('openMarkerModal', (e) => {
        openMarkerModal(e.detail.id, null, null, layerManager);
    });

    // Layer Style Modal
    const styleModal = document.getElementById('layer-style-modal');
    const closeStyleBtn = document.getElementById('close-style-modal');
    const saveStyleBtn = document.getElementById('save-style-btn');
    const delLayerBtn = document.getElementById('delete-layer-btn');
    
    let currentStyleLayerId = null;

    window.openStyleModal = (id) => {
        currentStyleLayerId = id;
        const layer = layerManager.layers.get(id);
        
        if (layer) {
            document.getElementById('style-layer-name').value = layer.name || '';
            const color = layer.style?.color || '#3b82f6';
            document.getElementById('style-stroke-color').value = color;
            document.getElementById('style-stroke-color-text').value = color;
            
            const fill = layer.style?.fillColor || color;
            document.getElementById('style-fill-color').value = fill;
            document.getElementById('style-fill-color-text').value = fill;
            
            const opacity = layer.style?.opacity || 70;
            document.getElementById('style-opacity').value = opacity;
            document.getElementById('style-opacity-value').textContent = opacity + '%';
            
            const weight = layer.style?.weight || 2;
            document.getElementById('style-weight').value = weight;
            document.getElementById('style-weight-value').textContent = weight + 'px';
            
            styleModal.classList.remove('hidden');
        }
    };

    closeStyleBtn?.addEventListener('click', () => styleModal.classList.add('hidden'));

    // Sync color inputs
    document.getElementById('style-stroke-color')?.addEventListener('input', (e) => {
        document.getElementById('style-stroke-color-text').value = e.target.value;
    });
    document.getElementById('style-fill-color')?.addEventListener('input', (e) => {
        document.getElementById('style-fill-color-text').value = e.target.value;
    });
    document.getElementById('style-opacity')?.addEventListener('input', (e) => {
        document.getElementById('style-opacity-value').textContent = e.target.value + '%';
    });
    document.getElementById('style-weight')?.addEventListener('input', (e) => {
        document.getElementById('style-weight-value').textContent = e.target.value + 'px';
    });

    saveStyleBtn?.addEventListener('click', async () => {
        if (currentStyleLayerId) {
            const style = {
                color: document.getElementById('style-stroke-color').value,
                fillColor: document.getElementById('style-fill-color').value,
                opacity: parseInt(document.getElementById('style-opacity').value),
                weight: parseInt(document.getElementById('style-weight').value)
            };
            const name = document.getElementById('style-layer-name').value;
            
            await layerManager.updateLayerStyle(currentStyleLayerId, style);
            // Also update name if needed
            if (name) {
                await layerManager.updateLayerStyle(currentStyleLayerId, style, name);
            }
            styleModal.classList.add('hidden');
        }
    });

    delLayerBtn?.addEventListener('click', async () => {
        if (currentStyleLayerId) {
            await layerManager.deleteLayerFromDb(currentStyleLayerId);
            window.showToast(window.i18n.t('toast_layer_deleted'));
            styleModal.classList.add('hidden');
        }
    });
}

function updateLayersList(layers, layerManager) {
    const list = document.getElementById('layers-list');
    const emptyState = document.getElementById('layers-empty');
    const badge = document.getElementById('layer-count-badge');
    
    if (!list) return;
    
    if (badge) badge.textContent = layers.length;

    if (layers.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        // Remove other children
        Array.from(list.children).forEach(child => {
            if (child.id !== 'layers-empty') child.remove();
        });
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    
    // Clear list (keep empty state)
    Array.from(list.children).forEach(child => {
        if (child.id !== 'layers-empty') child.remove();
    });

    layers.forEach(layer => {
        const item = document.createElement('div');
        item.className = 'layer-item';
        
        const isVisible = layer.visible !== false;
        
        item.innerHTML = `
            <div class="layer-info">
                <div class="layer-color" style="background-color: ${layer.style?.color || '#3b82f6'}"></div>
                <span class="layer-name" title="${layer.name}">${layer.name}</span>
            </div>
            <div class="layer-controls">
                <button class="icon-btn toggle-vis" data-id="${layer.id}" title="Toggle Visibility">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        ${isVisible 
                            ? '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>' 
                            : '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>'
                        }
                    </svg>
                </button>
                <button class="icon-btn edit-style" data-id="${layer.id}" title="Edit Style">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
                </button>
            </div>
        `;
        
        list.appendChild(item);

        // Add events
        item.querySelector('.toggle-vis').addEventListener('click', async () => {
            await layerManager.toggleLayerVisibility(layer.id, !isVisible);
        });
        
        item.querySelector('.edit-style').addEventListener('click', () => {
            window.openStyleModal(layer.id);
        });
    });
}

function updateMarkersList(markers, layerManager) {
    const list = document.getElementById('markers-list');
    const emptyState = document.getElementById('markers-empty');
    const badge = document.getElementById('marker-count-badge');
    
    if (!list) return;
    
    if (badge) badge.textContent = markers.length;

    if (markers.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        Array.from(list.children).forEach(child => {
            if (child.id !== 'markers-empty') child.remove();
        });
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    
    Array.from(list.children).forEach(child => {
        if (child.id !== 'markers-empty') child.remove();
    });

    markers.forEach(marker => {
        const item = document.createElement('div');
        item.className = 'marker-item';
        
        item.innerHTML = `
            <div class="layer-info" style="cursor:pointer;" title="Click to zoom">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                <span class="layer-name">${marker.title || 'Marker'}</span>
            </div>
            <div class="layer-controls">
                <button class="icon-btn edit-marker" data-id="${marker.id}" title="Edit Marker">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
            </div>
        `;
        
        list.appendChild(item);

        item.querySelector('.layer-info').addEventListener('click', () => {
            layerManager.mapManager.map.setView([marker.lat, marker.lng], 15);
            const leafletMarker = layerManager.leafletMarkers.get(marker.id);
            if(leafletMarker) leafletMarker.openPopup();
        });

        item.querySelector('.edit-marker').addEventListener('click', (e) => {
            e.stopPropagation();
            window.openMarkerModal(marker.id);
        });
    });
}
