// map-manager.js
class MapManager {
    constructor() {
        this.map = null;
        this.currentTileLayer = null;
        this.tileLayers = {};
        this.isAddingMarker = false;
        
        // Custom icons
        this.defaultIcon = L.icon({
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });

        this.initMap();
        this.setupTileLayers();
        this.setupControls();
        this.setupEvents();
    }

    initMap() {
        // Initialize map centered on a default location (e.g., London or center of the world)
        this.map = L.map('map', {
            zoomControl: false, // We'll use our custom controls
            attributionControl: false // Hide default attribution for cleaner look, we'll add our own if needed
        }).setView([20, 0], 3);

        // Add attribution control to bottom right (if RTL, it might move naturally, or we handle it via CSS)
        L.control.attribution({position: 'bottomright'}).addTo(this.map);
    }

    setupTileLayers() {
        this.tileLayers = {
            street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap'
            }),
            satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: '© Esri'
            }),
            dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                attribution: '© CARTO'
            }),
            terrain: L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}{r}.png', {
                maxZoom: 18,
                attribution: 'Map tiles by Stamen Design'
            })
        };

        // Set default layer
        this.setTileLayer('street');
    }

    setTileLayer(layerName) {
        if (this.currentTileLayer) {
            this.map.removeLayer(this.currentTileLayer);
        }
        
        const layer = this.tileLayers[layerName];
        if (layer) {
            layer.addTo(this.map);
            this.currentTileLayer = layer;
        }

        // Update UI buttons
        document.querySelectorAll('.layer-switch-btn').forEach(btn => {
            if (btn.dataset.layer === layerName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    setupControls() {
        // Layer switcher clicks
        document.querySelectorAll('.layer-switch-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const layer = e.currentTarget.dataset.layer;
                this.setTileLayer(layer);
            });
        });

        // Zoom controls
        document.getElementById('tool-zoom-in')?.addEventListener('click', () => {
            this.map.zoomIn();
        });
        
        document.getElementById('tool-zoom-out')?.addEventListener('click', () => {
            this.map.zoomOut();
        });

        // Locate tool
        document.getElementById('tool-locate')?.addEventListener('click', () => {
            this.map.locate({setView: true, maxZoom: 16});
        });

        // Fullscreen tool (basic implementation)
        document.getElementById('tool-fullscreen')?.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.log(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
                });
            } else {
                document.exitFullscreen();
            }
        });
    }

    setupEvents() {
        // Update coordinates display on mousemove
        const coordsText = document.getElementById('coords-text');
        if (coordsText) {
            this.map.on('mousemove', (e) => {
                const lat = e.latlng.lat.toFixed(4);
                const lng = e.latlng.lng.toFixed(4);
                coordsText.textContent = `${lat}, ${lng}`;
            });
        }

        // Map click for adding markers
        this.map.on('click', (e) => {
            if (this.isAddingMarker) {
                this.triggerMarkerAdd(e.latlng);
                this.disableMarkerMode();
            }
        });

        // Location found event
        this.map.on('locationfound', (e) => {
            const radius = e.accuracy / 2;
            L.circle(e.latlng, radius).addTo(this.map);
        });
    }

    enableMarkerMode() {
        this.isAddingMarker = true;
        this.map.getContainer().style.cursor = 'crosshair';
        document.getElementById('marker-mode-indicator')?.classList.remove('hidden');
    }

    disableMarkerMode() {
        this.isAddingMarker = false;
        this.map.getContainer().style.cursor = '';
        document.getElementById('marker-mode-indicator')?.classList.add('hidden');
    }

    triggerMarkerAdd(latlng) {
        // Dispatch custom event that app.js can listen to
        const event = new CustomEvent('map:addMarker', {
            detail: { latlng }
        });
        window.dispatchEvent(event);
    }
}

// Will be initialized in app.js
window.MapManager = MapManager;
