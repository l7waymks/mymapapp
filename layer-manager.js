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
            // Update styles dynamically: lines/polygons get the layer style, points keep category colors
            leafletLayer.eachLayer(layer => {
                if (layer instanceof L.CircleMarker) {
                    const catStyle = this.getCategoryStyle(layer.feature);
                    layer.setStyle({
                        fillColor: catStyle.fillColor,
                        color: catStyle.color,
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.85
                    });
                } else if (layer.setStyle) {
                    layer.setStyle(style);
                }
            });
            
            if (layerData.visible && !this.mapManager.map.hasLayer(leafletLayer)) {
                this.mapManager.map.addLayer(leafletLayer);
            } else if (!layerData.visible && this.mapManager.map.hasLayer(leafletLayer)) {
                this.mapManager.map.removeLayer(leafletLayer);
            }
            return;
        }

        // Create new layer
        leafletLayer = L.geoJSON(null, {
            style: (feature) => {
                if (feature && feature.geometry && feature.geometry.type === 'Point') {
                    const catStyle = this.getCategoryStyle(feature);
                    return {
                        fillColor: catStyle.fillColor,
                        color: catStyle.color,
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.85
                    };
                }
                return style;
            },
            pointToLayer: (feature, latlng) => {
                const catStyle = this.getCategoryStyle(feature);
                return L.circleMarker(latlng, {
                    radius: catStyle.radius || 9
                });
            },
            onEachFeature: (feature, layer) => {
                const props = feature.properties || {};
                const catInfo = this.getCategoryInfo(feature);
                const name = props.name || props.NAME || props.nom || 'غير محدد';
                const type = props.type || props.amenity || props.category || props.shop || '';
                
                layer.bindPopup(`
                    <div style="font-family:'Noto Sans Arabic',sans-serif; min-width:160px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                            <span style="font-size:1.4rem;">${catInfo.icon}</span>
                            <div>
                                <strong style="display:block;font-size:0.9rem;">${name}</strong>
                                <span style="font-size:0.75rem;color:${catInfo.color};font-weight:600;">${catInfo.label}</span>
                            </div>
                        </div>
                        ${type ? `<div style="font-size:0.75rem;color:#94a3b8;">النوع: ${type}</div>` : ''}
                    </div>
                `);
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

    // ---- Category Color System ----
    // Detects feature type from properties and returns style/info
    
    // All supported categories
    static get CATEGORIES() {
        return {
            // عيادة بيطرية
            vet:       { color: '#ef4444', fillColor: '#ef4444', radius: 10, icon: '🏥', label: 'عيادة بيطرية' },
            // متجر حيوانات
            pet_shop:  { color: '#f97316', fillColor: '#f97316', radius: 10, icon: '🐾', label: 'متجر حيوانات' },
            // ملجأ / إيواء
            shelter:   { color: '#8b5cf6', fillColor: '#8b5cf6', radius: 10, icon: '🏠', label: 'ملجأ حيوانات' },
            // حديقة حيوانات
            zoo:       { color: '#10b981', fillColor: '#10b981', radius: 10, icon: '🦁', label: 'حديقة حيوانات' },
            // حلاقة وتجميل
            grooming:  { color: '#ec4899', fillColor: '#ec4899', radius: 10, icon: '✂️', label: 'صالون تجميل' },
            // تدريب حيوانات
            training:  { color: '#3b82f6', fillColor: '#3b82f6', radius: 10, icon: '🎾', label: 'مركز تدريب' },
            // مطعم / كافيه
            cafe:      { color: '#f59e0b', fillColor: '#f59e0b', radius: 10, icon: '☕', label: 'مقهى' },
            // حديقة / متنزه
            park:      { color: '#22c55e', fillColor: '#22c55e', radius: 10, icon: '🌳', label: 'حديقة عامة' },
            // افتراضي
            default:   { color: '#64748b', fillColor: '#64748b', radius: 8,  icon: '📍', label: 'مكان' },
        };
    }

    _detectCategory(feature) {
        const props = feature.properties || {};
        // Try every common key
        const val = (
            props.amenity || props.shop || props.type || props.category ||
            props.fclass || props.class || props.leisure || props.tourism || ''
        ).toString().toLowerCase().trim();

        // Arabic keywords matching
        const arabicVal = (props.name || props.NAME || '').toString().toLowerCase();

        if (val.includes('vet') || val.includes('veterinary') || arabicVal.includes('بيطر') || arabicVal.includes('عيادة')) 
            return 'vet';
        if (val.includes('pet_shop') || val.includes('pet') || arabicVal.includes('متجر') || arabicVal.includes('حيوان'))
            return 'pet_shop';
        if (val.includes('shelter') || val.includes('rescue') || arabicVal.includes('ملجأ') || arabicVal.includes('إيواء') || arabicVal.includes('انقاذ'))
            return 'shelter';
        if (val.includes('zoo') || val.includes('aquarium') || arabicVal.includes('حديقة حيوان') || arabicVal.includes('أكواريوم'))
            return 'zoo';
        if (val.includes('groom') || arabicVal.includes('تجميل') || arabicVal.includes('حلاقة'))
            return 'grooming';
        if (val.includes('train') || arabicVal.includes('تدريب'))
            return 'training';
        if (val.includes('cafe') || val.includes('restaurant') || arabicVal.includes('كافيه') || arabicVal.includes('مطعم'))
            return 'cafe';
        if (val.includes('park') || val.includes('garden') || arabicVal.includes('حديقة') || arabicVal.includes('متنزه'))
            return 'park';

        return 'default';
    }

    getCategoryStyle(feature) {
        const cat = this._detectCategory(feature);
        return LayerManager.CATEGORIES[cat] || LayerManager.CATEGORIES.default;
    }

    getCategoryInfo(feature) {
        const cat = this._detectCategory(feature);
        return LayerManager.CATEGORIES[cat] || LayerManager.CATEGORIES.default;
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
