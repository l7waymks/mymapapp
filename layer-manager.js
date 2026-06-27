// layer-manager.js
class LayerManager {
    constructor(mapManager) {
        this.mapManager = mapManager;
        this.supabase = window.supabaseClient;
        this.layers = new Map(); // id -> data
        this.leafletLayers = new Map(); // id -> L.GeoJSON
        this.markers = new Map(); // id -> data
        this.leafletMarkers = new Map(); // id -> L.Marker
        
        this.init();
    }

    async init() {
        if (!this.supabase) {
            console.error("Supabase client not initialized.");
            window.showToast("Database not connected", true);
            return;
        }

        // 1. Fetch initial state
        await this.fetchInitialData();

        // 2. Setup Realtime Subscriptions
        this.setupRealtimeSubscriptions();
    }

    async fetchInitialData() {
        try {
            // Fetch Layers
            const { data: layersData, error: layersErr } = await this.supabase
                .from('layers')
                .select('*');
            
            if (layersErr) throw layersErr;

            if (layersData) {
                const isFirstLoad = this.layers.size === 0;
                layersData.forEach(layer => {
                    this.layers.set(layer.id, layer);
                    this.renderLayer(layer);
                });
                
                if (isFirstLoad && layersData.length > 0) {
                    this.fitAllLayers();
                }
                this.updateLayerUI();
            }

            // Fetch Markers
            const { data: markersData, error: markersErr } = await this.supabase
                .from('markers')
                .select('*');
            
            if (markersErr) throw markersErr;

            if (markersData) {
                markersData.forEach(marker => {
                    this.markers.set(marker.id, marker);
                    this.renderMarker(marker);
                });
                this.updateMarkerUI();
            }

        } catch (err) {
            console.error("Error fetching initial Supabase data:", err);
            window.showToast("Failed to load map data", true);
        }
    }

    setupRealtimeSubscriptions() {
        // Subscribe to public:layers changes
        this.supabase
            .channel('public:layers')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'layers' }, payload => {
                this.handleLayerChange(payload);
            })
            .subscribe();

        // Subscribe to public:markers changes
        this.supabase
            .channel('public:markers')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'markers' }, payload => {
                this.handleMarkerChange(payload);
            })
            .subscribe();
    }

    handleLayerChange(payload) {
        const { eventType, new: newRecord, old: oldRecord } = payload;

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            this.layers.set(newRecord.id, newRecord);
            this.renderLayer(newRecord);
            this.updateLayerUI();
        } else if (eventType === 'DELETE') {
            this.removeLayerLocal(oldRecord.id);
            this.updateLayerUI();
        }
    }

    handleMarkerChange(payload) {
        const { eventType, new: newRecord, old: oldRecord } = payload;

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            this.markers.set(newRecord.id, newRecord);
            this.renderMarker(newRecord);
            this.updateMarkerUI();
        } else if (eventType === 'DELETE') {
            this.removeMarkerLocal(oldRecord.id);
            this.updateMarkerUI();
        }
    }

    // --- Layers ---
    
    renderLayer(layerData) {
        let leafletLayer = this.leafletLayers.get(layerData.id);
        
        const style = {
            color: layerData.style?.color || '#3b82f6',
            weight: layerData.style?.weight || 2,
            opacity: (layerData.style?.opacity || 70) / 100,
            fillColor: layerData.style?.fillColor || '#3b82f6',
            fillOpacity: (layerData.style?.opacity || 70) / 100 * 0.5
        };

        if (leafletLayer) {
            leafletLayer.setStyle(style);
            
            if (layerData.visible && !this.mapManager.map.hasLayer(leafletLayer)) {
                this.mapManager.map.addLayer(leafletLayer);
            } else if (!layerData.visible && this.mapManager.map.hasLayer(leafletLayer)) {
                this.mapManager.map.removeLayer(leafletLayer);
            }
            return;
        }

        // Create new layer
        leafletLayer = L.geoJSON(null, {
            style: style,
            pointToLayer: (feature, latlng) => {
                return L.circleMarker(latlng, {
                    radius: 8,
                    fillColor: style.fillColor,
                    color: style.color,
                    weight: style.weight,
                    opacity: style.opacity,
                    fillOpacity: style.fillOpacity
                });
            },
            onEachFeature: (feature, layer) => {
                if (feature.properties && feature.properties.name) {
                    layer.bindPopup(`<strong>${feature.properties.name}</strong>`);
                }
            }
        });

        if (layerData.visible !== false) {
            leafletLayer.addTo(this.mapManager.map);
        }
        
        this.leafletLayers.set(layerData.id, leafletLayer);

        let features = layerData.features || [];
        // Support both compressed array format and regular GeoJSON format (for safety)
        if (features.length > 0 && Array.isArray(features[0])) {
            features = this.decompressFeatures(features);
        }

        if (features.length > 0) {
            leafletLayer.addData({
                type: "FeatureCollection",
                features: features
            });
        }
    }

    decompressFeatures(compressed) {
        if (!compressed) return [];
        const typeMap = { 1: 'Point', 2: 'LineString', 3: 'Polygon', 4: 'MultiPolygon' };
        return compressed.map(c => {
            const type = typeMap[c[0]];
            if (!type) return null;
            
            const properties = { name: c[2] || '' };
            if (c[3]) {
                Object.assign(properties, c[3]);
            }

            return {
                type: "Feature",
                geometry: {
                    type: type,
                    coordinates: c[1]
                },
                properties: properties
            };
        }).filter(Boolean);
    }

    fitAllLayers() {
        try {
            const activeLayers = Array.from(this.leafletLayers.values()).filter(layer => 
                this.mapManager.map.hasLayer(layer)
            );
            if (activeLayers.length === 0) return;
            
            const group = new L.FeatureGroup(activeLayers);
            const bounds = group.getBounds();
            if (bounds.isValid()) {
                this.mapManager.map.fitBounds(bounds, { padding: [50, 50] });
            }
        } catch(e) {
            console.error("Error fitting bounds:", e);
        }
    }

    removeLayerLocal(id) {
        const leafletLayer = this.leafletLayers.get(id);
        if (leafletLayer) {
            this.mapManager.map.removeLayer(leafletLayer);
            this.leafletLayers.delete(id);
        }
        this.layers.delete(id);
    }

    async toggleLayerVisibility(id, visible) {
        try {
            const { error } = await this.supabase
                .from('layers')
                .update({ visible: visible })
                .eq('id', id);
            
            if (error) throw error;
        } catch (err) {
            console.error("Error toggling layer visibility:", err);
            window.showToast("Failed to toggle visibility", true);
        }
    }

    async deleteLayerFromDb(id) {
        try {
            const { error } = await this.supabase
                .from('layers')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            return true;
        } catch (err) {
            console.error("Error deleting layer:", err);
            window.showToast("Failed to delete layer", true);
            return false;
        }
    }

    async updateLayerStyle(id, styleData, name) {
        try {
            const updates = { style: styleData };
            if (name) updates.name = name;

            const { error } = await this.supabase
                .from('layers')
                .update(updates)
                .eq('id', id);
            
            if (error) throw error;
            return true;
        } catch (err) {
            console.error("Error updating layer style:", err);
            window.showToast("Failed to update style", true);
            return false;
        }
    }

    updateLayerUI() {
        window.dispatchEvent(new CustomEvent('layersUpdated', {
            detail: { layers: Array.from(this.layers.values()) }
        }));
    }

    // --- Markers ---

    renderMarker(data) {
        let marker = this.leafletMarkers.get(data.id);
        
        const popupContent = `
            <div class="custom-popup">
                <h4 style="margin:0 0 5px 0;">${data.title || 'Marker'}</h4>
                <p style="margin:0;">${data.description || ''}</p>
                <button class="edit-marker-btn" data-id="${data.id}" style="margin-top:10px; font-size:12px; cursor:pointer;">Edit</button>
            </div>
        `;

        if (marker) {
            marker.setLatLng([data.lat, data.lng]);
            marker.getPopup().setContent(popupContent);
        } else {
            marker = L.marker([data.lat, data.lng], {
                icon: this.mapManager.defaultIcon
            }).addTo(this.mapManager.map);
            
            marker.bindPopup(popupContent);
            
            marker.on('popupopen', () => {
                const editBtn = document.querySelector(`.edit-marker-btn[data-id="${data.id}"]`);
                if (editBtn) {
                    editBtn.addEventListener('click', () => {
                        window.dispatchEvent(new CustomEvent('openMarkerModal', { detail: { id: data.id } }));
                        marker.closePopup();
                    });
                }
            });

            this.leafletMarkers.set(data.id, marker);
        }
    }

    removeMarkerLocal(id) {
        const marker = this.leafletMarkers.get(id);
        if (marker) {
            this.mapManager.map.removeLayer(marker);
            this.leafletMarkers.delete(id);
        }
        this.markers.delete(id);
    }

    async addMarker(lat, lng, title = '', description = '') {
        try {
            const id = 'marker_' + Date.now();
            const { error } = await this.supabase
                .from('markers')
                .insert([{ id, lat, lng, title, description }]);
            
            if (error) throw error;
            return true;
        } catch (err) {
            console.error("Error adding marker:", err);
            window.showToast("Failed to add marker", true);
            return false;
        }
    }

    async updateMarker(id, title, description) {
        try {
            const { error } = await this.supabase
                .from('markers')
                .update({ title, description })
                .eq('id', id);
            
            if (error) throw error;
            return true;
        } catch (err) {
            console.error("Error updating marker:", err);
            window.showToast("Failed to update marker", true);
            return false;
        }
    }

    async deleteMarker(id) {
        try {
            const { error } = await this.supabase
                .from('markers')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            return true;
        } catch (err) {
            console.error("Error deleting marker:", err);
            window.showToast("Failed to delete marker", true);
            return false;
        }
    }

    updateMarkerUI() {
        window.dispatchEvent(new CustomEvent('markersUpdated', {
            detail: { markers: Array.from(this.markers.values()) }
        }));
    }
}

window.LayerManager = LayerManager;
