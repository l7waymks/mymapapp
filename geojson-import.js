// geojson-import.js
class GeoJsonImporter {
    constructor(db) {
        this.db = db;
        this.setupFileInput();
    }

    setupFileInput() {
        const input = document.getElementById('geojson-file-input');
        const btn = document.getElementById('import-geojson-btn');

        if (btn && input) {
            btn.addEventListener('click', () => {
                input.click();
            });

            input.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFile(e.target.files[0]);
                }
                // Reset input so the same file can be selected again
                input.value = '';
            });
        }
    }

    async handleFile(file) {
        if (!file.name.endsWith('.geojson') && !file.name.endsWith('.json')) {
            this.showError('Please select a valid .geojson or .json file');
            return;
        }

        try {
            window.showToast('Reading file...');
            const text = await file.text();
            const data = JSON.parse(text);

            if (data.type !== 'FeatureCollection') {
                // If it's a single feature, wrap it
                if (data.type === 'Feature') {
                    await this.uploadToFirestore(file.name, {
                        type: 'FeatureCollection',
                        features: [data]
                    });
                } else {
                    this.showError('Invalid GeoJSON format. Must be a FeatureCollection or Feature.');
                }
            } else {
                await this.uploadToFirestore(file.name, data);
            }
        } catch (error) {
            console.error('Error parsing GeoJSON:', error);
            this.showError('Failed to parse file as JSON');
        }
    }

    async uploadToFirestore(filename, geojsonData) {
        window.showToast('Processing file...');
        
        const features = geojsonData.features || [];
        const layerName = filename.replace('.geojson', '').replace('.json', '');
        
        // Default style
        const style = {
            color: '#3b82f6',
            weight: 2,
            opacity: 70,
            fillColor: '#3b82f6'
        };

        // 1. Render Locally First (Works even if Firebase fails)
        const localLayerId = 'local_' + Date.now();
        const layerData = {
            id: localLayerId,
            name: layerName,
            visible: true,
            style: style,
            featureCount: features.length
        };
        
        if (window.layerManager) {
            window.layerManager.layers.set(localLayerId, layerData);
            window.layerManager.renderLayer(layerData, features);
            window.layerManager.updateLayerUI();
            window.showToast('GeoJSON loaded successfully on the map');
        }

        // 2. Try to upload to Firestore (Background)
        if (!this.db || !this.db.collection) {
            console.warn('Firebase not connected. GeoJSON is only visible locally.');
            return;
        }

        try {
            const batchSize = 400; // Firestore batch limit is 500
            
            // Create layer document
            const layerRef = this.db.collection('layers').doc(localLayerId); // use same ID so local syncs with remote
            
            await layerRef.set({
                name: layerName,
                visible: true,
                style: style,
                featureCount: features.length,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Feature-level decomposition: upload features in batches
            if (features.length > 0) {
                let batch = this.db.batch();
                let count = 0;
                let batchCount = 0;

                for (let i = 0; i < features.length; i++) {
                    const featureRef = layerRef.collection('features').doc();
                    batch.set(featureRef, features[i]);
                    count++;

                    if (count === batchSize || i === features.length - 1) {
                        await batch.commit();
                        batchCount++;
                        // window.showToast(`Uploaded batch ${batchCount}...`);
                        
                        // Start new batch
                        batch = this.db.batch();
                        count = 0;
                    }
                }
            }
            console.log('Saved to Firestore successfully');
        } catch (error) {
            console.warn('Could not save to Firestore (You probably need to configure your API keys). It will remain local only.', error);
        }
    }

    showError(msg) {
        window.showToast(msg, true);
    }
}

window.GeoJsonImporter = GeoJsonImporter;
