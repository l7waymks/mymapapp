// geojson-import.js
class GeoJsonImporter {
    constructor() {
        this.supabase = window.supabaseClient;
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
                if (data.type === 'Feature') {
                    await this.uploadToSupabase(file.name, {
                        type: 'FeatureCollection',
                        features: [data]
                    });
                } else {
                    this.showError('Invalid GeoJSON format. Must be a FeatureCollection or Feature.');
                }
            } else {
                await this.uploadToSupabase(file.name, data);
            }
        } catch (error) {
            console.error('Error parsing GeoJSON:', error);
            this.showError('Failed to parse file as JSON');
        }
    }

    async uploadToSupabase(filename, geojsonData) {
        window.showToast('Processing file...');
        
        const features = geojsonData.features || [];
        const layerName = filename.replace('.geojson', '').replace('.json', '');
        
        const style = {
            color: '#3b82f6',
            weight: 2,
            opacity: 70,
            fillColor: '#3b82f6'
        };

        // Ramer-Douglas-Peucker (RDP) Simplification algorithm
        const getSqSegDist = (p, p1, p2) => {
            let x = p1[0], y = p1[1];
            let dx = p2[0] - x, dy = p2[1] - y;
            if (dx !== 0 || dy !== 0) {
                let t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
                if (t > 1) {
                    x = p2[0];
                    y = p2[1];
                } else if (t > 0) {
                    x += dx * t;
                    y += dy * t;
                }
            }
            dx = p[0] - x;
            dy = p[1] - y;
            return dx * dx + dy * dy;
        };

        const simplifyRDP = (points, tolerance) => {
            const sqTolerance = tolerance * tolerance;
            const len = points.length;
            if (len <= 2) return points;
            
            let maxSqDist = 0;
            let index = 0;
            for (let i = 1; i < len - 1; i++) {
                const sqDist = getSqSegDist(points[i], points[0], points[len - 1]);
                if (sqDist > maxSqDist) {
                    index = i;
                    maxSqDist = sqDist;
                }
            }
            if (maxSqDist > sqTolerance) {
                const results1 = simplifyRDP(points.slice(0, index + 1), tolerance);
                const results2 = simplifyRDP(points.slice(index), tolerance);
                return results1.slice(0, results1.length - 1).concat(results2);
            }
            return [points[0], points[len - 1]];
        };

        const simplifyGeometry = (geom, tolerance = 0.00005) => {
            if (!geom || !geom.coordinates) return geom;
            if (geom.type === 'LineString') {
                geom.coordinates = simplifyRDP(geom.coordinates, tolerance);
            } else if (geom.type === 'Polygon') {
                geom.coordinates = geom.coordinates.map(ring => simplifyRDP(ring, tolerance));
            } else if (geom.type === 'MultiPolygon') {
                geom.coordinates = geom.coordinates.map(polygon => 
                    polygon.map(ring => simplifyRDP(ring, tolerance))
                );
            }
            return geom;
        };

        // Utility to reduce JSON payload size by truncating coordinates to 6 decimals
        const truncateCoordinates = (coords) => {
            if (Array.isArray(coords)) {
                if (typeof coords[0] === 'number') {
                    return coords.map(c => Math.round(c * 1000000) / 1000000);
                }
                return coords.map(truncateCoordinates);
            }
            return coords;
        };

        // Simplify and compress features
        const processedFeatures = [];
        const typeMap = { 'Point': 1, 'LineString': 2, 'Polygon': 3, 'MultiPolygon': 4 };

        features.forEach(f => {
            if (!f.geometry) return;
            
            // 1. Simplify geometry (if Line or Polygon)
            let geom = JSON.parse(JSON.stringify(f.geometry)); // deep copy
            geom = simplifyGeometry(geom, 0.00005); // 0.00005 tolerance is ~5 meters
            
            // 2. Truncate coordinates to 6 decimals
            geom.coordinates = truncateCoordinates(geom.coordinates);

            // 3. Compress attributes (only keep name and key small properties)
            const typeId = typeMap[geom.type] || 0;
            if (typeId === 0) return; // Skip unsupported types

            const name = f.properties?.name || '';
            const extraProps = {};
            if (f.properties) {
                for (let k in f.properties) {
                    if (k !== 'name' && typeof f.properties[k] !== 'object') {
                        // Only keep short attributes (under 50 chars)
                        const val = String(f.properties[k]);
                        if (val.length < 50) {
                            extraProps[k] = f.properties[k];
                        }
                    }
                }
            }

            // Compressed format: [typeId, coordinates, name, extraProps (if any)]
            const compressedFeature = [
                typeId,
                geom.coordinates,
                name
            ];
            if (Object.keys(extraProps).length > 0) {
                compressedFeature.push(extraProps);
            }

            processedFeatures.push(compressedFeature);
        });

        const localLayerId = 'local_' + Date.now();
        const layerData = {
            id: localLayerId,
            name: layerName,
            visible: true,
            style: style,
            features: processedFeatures
        };
        
        // 1. Render Locally for instant feedback
        if (window.layerManager) {
            window.layerManager.layers.set(localLayerId, layerData);
            window.layerManager.renderLayer(layerData);
            window.layerManager.updateLayerUI();
            window.showToast('GeoJSON loaded successfully on the map');
        }

        // 2. Upload to Supabase
        if (!this.supabase) {
            console.warn('Supabase not connected. GeoJSON is only visible locally.');
            return;
        }

        try {
            // Replace prefix so it becomes a global layer, not local-only
            const remoteLayerId = 'layer_' + Date.now();
            layerData.id = remoteLayerId;

            // Remove the temporary local layer since the realtime handler will add the remote one
            if (window.layerManager) {
                window.layerManager.removeLayerLocal(localLayerId);
            }

            const { error } = await this.supabase
                .from('layers')
                .insert([layerData]);

            if (error) throw error;
            console.log('Saved to Supabase successfully');
        } catch (error) {
            console.error('Error uploading to Supabase:', error);
            this.showError('Upload failed. It will remain local only.');
        }
    }

    showError(msg) {
        window.showToast(msg, true);
    }
}

window.GeoJsonImporter = GeoJsonImporter;
