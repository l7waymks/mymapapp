// layer-manager.js
class LayerManager {
    constructor(mapManager, db) {
        this.mapManager = mapManager;
        this.db = db;
        this.layers = new Map(); // id -> data
        this.leafletLayers = new Map(); // id -> L.GeoJSON
        this.markers = new Map(); // id -> data
        this.leafletMarkers = new Map(); // id -> L.Marker
        
        this.unsubscribeLayers = null;
        this.unsubscribeMarkers = null;

        this.init();
    }

    init() {
        if (!this.db) {
            console.error('Firestore DB not initialized');
            return;
        }

        // Start listening to collections
        this.listenToLayers();
        this.listenToMarkers();
    }

    // --- Layers (GeoJSON) ---

    listenToLayers() {
        this.unsubscribeLayers = this.db.collection('layers').onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const data = { id: change.doc.id, ...change.doc.data() };
                
                if (change.type === 'added' || change.type === 'modified') {
                    this.layers.set(data.id, data);
                    this.renderLayer(data);
                    this.updateLayerUI();
                }
                if (change.type === 'removed') {
                    this.removeLayer(data.id);
                    this.updateLayerUI();
                }
            });
        }, (error) => {
            console.error("Error listening to layers: ", error);
        });
    }

    async renderLayer(layerData, localFeatures = null) {
        let leafletLayer = this.leafletLayers.get(layerData.id);
        
        // Setup style function
        const style = {
            color: layerData.style?.color || '#3b82f6',
            weight: layerData.style?.weight || 2,
            opacity: (layerData.style?.opacity || 70) / 100,
            fillColor: layerData.style?.fillColor || '#3b82f6',
            fillOpacity: (layerData.style?.opacity || 70) / 100 * 0.5 // fill usually a bit more transparent
        };

        if (leafletLayer) {
            // Update style
            leafletLayer.setStyle(style);
            
            // Check visibility
            if (layerData.visible && !this.mapManager.map.hasLayer(leafletLayer)) {
                this.mapManager.map.addLayer(leafletLayer);
            } else if (!layerData.visible && this.mapManager.map.hasLayer(leafletLayer)) {
                this.mapManager.map.removeLayer(leafletLayer);
            }
            return;
        }

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

        // If local features are provided, use them immediately and skip Firestore fetch
        if (localFeatures) {
            leafletLayer.addData({
                type: "FeatureCollection",
                features: localFeatures
            });
            try {
                this.mapManager.map.fitBounds(leafletLayer.getBounds());
            } catch(e){}
            return;
        }

        // Fetch features from Firestore
        try {
            const featuresSnapshot = await this.db.collection('layers').doc(layerData.id).collection('features').get();
            const features = [];
            featuresSnapshot.forEach(doc => {
                features.push(doc.data());
            });
            
            if (features.length > 0) {
                leafletLayer.addData({
                    type: "FeatureCollection",
                    features: features
                });
                
                // Only zoom to bounds if it's newly added and we want to focus it
                // this.mapManager.map.fitBounds(leafletLayer.getBounds());
            }
        } catch (error) {
            console.error("Error fetching features for layer", layerData.id, error);
        }
    }

    removeLayer(id) {
        const leafletLayer = this.leafletLayers.get(id);
        if (leafletLayer) {
            this.mapManager.map.removeLayer(leafletLayer);
            this.leafletLayers.delete(id);
        }
        this.layers.delete(id);
    }

    async deleteLayerFromDb(id) {
        try {
            // Note: In Firestore, deleting a doc doesn't delete subcollections automatically.
            // For a robust app, use a Cloud Function or batch delete features first.
            // Here we just delete the main doc for simplicity.
            await this.db.collection('layers').doc(id).delete();
            return true;
        } catch (error) {
            console.error("Error deleting layer", error);
            return false;
        }
    }

    async updateLayerStyle(id, styleData) {
        try {
            await this.db.collection('layers').doc(id).update({
                style: styleData
            });
            return true;
        } catch (error) {
            console.error("Error updating layer style", error);
            return false;
        }
    }

    updateLayerUI() {
        window.dispatchEvent(new CustomEvent('layersUpdated', {
            detail: { layers: Array.from(this.layers.values()) }
        }));
    }

    // --- Markers ---

    listenToMarkers() {
        this.unsubscribeMarkers = this.db.collection('markers').onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const data = { id: change.doc.id, ...change.doc.data() };
                
                if (change.type === 'added' || change.type === 'modified') {
                    this.markers.set(data.id, data);
                    this.renderMarker(data);
                    this.updateMarkerUI();
                }
                if (change.type === 'removed') {
                    this.removeMarker(data.id);
                    this.updateMarkerUI();
                }
            });
        }, (error) => {
            console.error("Error listening to markers: ", error);
        });
    }

    renderMarker(data) {
        let marker = this.leafletMarkers.get(data.id);
        
        if (marker) {
            // Update existing
            marker.setLatLng([data.lat, data.lng]);
            const popupContent = `
                <div class="custom-popup">
                    <h4 style="margin:0 0 5px 0;">${data.title || 'Marker'}</h4>
                    <p style="margin:0;">${data.description || ''}</p>
                    <button class="edit-marker-btn" data-id="${data.id}" style="margin-top:10px; font-size:12px; cursor:pointer;">Edit</button>
                </div>
            `;
            marker.getPopup().setContent(popupContent);
        } else {
            // Create new
            marker = L.marker([data.lat, data.lng], {
                icon: this.mapManager.defaultIcon
            }).addTo(this.mapManager.map);
            
            const popupContent = `
                <div class="custom-popup">
                    <h4 style="margin:0 0 5px 0;">${data.title || 'Marker'}</h4>
                    <p style="margin:0;">${data.description || ''}</p>
                    <button class="edit-marker-btn" data-id="${data.id}" style="margin-top:10px; font-size:12px; cursor:pointer;">Edit</button>
                </div>
            `;
            
            marker.bindPopup(popupContent);
            
            // Handle popup events to attach listeners to the edit button
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

    removeMarker(id) {
        const marker = this.leafletMarkers.get(id);
        if (marker) {
            this.mapManager.map.removeLayer(marker);
            this.leafletMarkers.delete(id);
        }
        this.markers.delete(id);
    }

    async addMarker(lat, lng, title = '', description = '') {
        try {
            await this.db.collection('markers').add({
                lat,
                lng,
                title,
                description,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error("Error adding marker", error);
            return false;
        }
    }

    async updateMarker(id, title, description) {
        try {
            await this.db.collection('markers').doc(id).update({
                title,
                description,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error("Error updating marker", error);
            return false;
        }
    }

    async deleteMarker(id) {
        try {
            await this.db.collection('markers').doc(id).delete();
            return true;
        } catch (error) {
            console.error("Error deleting marker", error);
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
