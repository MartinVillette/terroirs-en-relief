// Configuration
const CONFIG = {
    dataPath: 'data/processed/vignes.geojson',
    colors: {
        slope: d3.interpolateRdYlGn,
        altitude: d3.interpolateViridis,
        exposure: d3.interpolateRdYlBu
    }
};

// Variables globales
let vineyardData = null;
let filteredData = null;
let mapElements = null; // Pour stocker les éléments SVG
let currentFilters = {
    department: 'none',
    slopeMin: 0,
    altitudeMin: 0,
    altitudeMax: 500
};

// ============================================
// CHARGEMENT DES DONNÉES
// ============================================
async function loadData() {
    try {
        console.log('📂 Chargement des données...');
        const data = await d3.json(CONFIG.dataPath);
        vineyardData = data;
        filteredData = data; // Initialisation
        
        console.log(`✅ ${data.features.length} parcelles chargées`);
        
        // Initialiser les visualisations
        initMap();
        createCharts();
        updateStats();
        initFilters(); // ✨ NOUVEAU
        
    } catch (error) {
        console.error('❌ Erreur de chargement:', error);
        d3.select('#stats-content').html(`
            <p style="color: red;">❌ Erreur: Impossible de charger les données</p>
            <p>Assurez-vous d'utiliser un serveur local</p>
        `);
    }
}

// ============================================
// ✨ NOUVEAU : SYSTÈME DE FILTRAGE
// ============================================
function initFilters() {
    // Filtre département
    d3.select('#dept-filter').on('change', function() {
        currentFilters.department = this.value;
        applyFilters();
    });
    
    // Filtre pente
    d3.select('#slope-filter').on('input', function() {
        currentFilters.slopeMin = +this.value;
        d3.select('#slope-value').text(`${this.value}%`);
        applyFilters();
    });
    
    // Filtres altitude
    d3.select('#altitude-min').on('input', function() {
        currentFilters.altitudeMin = +this.value;
        updateAltitudeLabel();
        applyFilters();
    });
    
    d3.select('#altitude-max').on('input', function() {
        currentFilters.altitudeMax = +this.value;
        updateAltitudeLabel();
        applyFilters();
    });
    
    // Bouton reset
    d3.select('#reset-filters').on('click', resetFilters);
}

function updateAltitudeLabel() {
    const min = currentFilters.altitudeMin;
    const max = currentFilters.altitudeMax;
    d3.select('#alt-value').text(`${min}-${max}m`);
}

function applyFilters() {
    console.log('🔍 Application des filtres...', currentFilters);
    
    // Filtrer les données
    filteredData = {
        type: 'FeatureCollection',
        features: vineyardData.features.filter(f => {
            const props = f.properties;
            
            // Filtre département
            if (currentFilters.department !== 'all' && 
                props.dep_parc !== currentFilters.department) {
                return false;
            }
            
            // Filtre pente
            if (props.pente_mean < currentFilters.slopeMin) {
                return false;
            }
            
            // Filtre altitude
            if (props.alt_mean < currentFilters.altitudeMin || 
                props.alt_mean > currentFilters.altitudeMax) {
                return false;
            }
            
            return true;
        })
    };
    
    console.log(`✅ ${filteredData.features.length} parcelles après filtrage`);
    
    // Mettre à jour les visualisations
    updateMap();
    updateCharts();
    updateStats();
}

function resetFilters() {
    // Réinitialiser les valeurs
    currentFilters = {
        department: 'all',
        slopeMin: 0,
        altitudeMin: 0,
        altitudeMax: 500
    };
    
    // Réinitialiser les contrôles
    d3.select('#dept-filter').property('value', 'all');
    d3.select('#slope-filter').property('value', 0);
    d3.select('#altitude-min').property('value', 0);
    d3.select('#altitude-max').property('value', 500);
    d3.select('#slope-value').text('0%');
    d3.select('#alt-value').text('0-500m');
    
    // Réappliquer
    applyFilters();
}

// ============================================
// CARTE INTERACTIVE
// ============================================

async function initMap() {
    const width = 900;
    const height = 700;
    
    const svg = d3.select('#map')
        .attr('width', width)
        .attr('height', height);
    
    // ✨ CORRECTION : Charger le fond de carte
    let alsaceBackground = null;
    
    try {
        console.log('📍 Chargement du fond de carte Alsace...');
        
        // ✨ Utiliser les contours des départements depuis une source fiable
        const alsaceUrl = 'https://france-geojson.gregoiredavid.fr/repo/departements/67-bas-rhin/departement-67-bas-rhin.geojson';
        const hautRhinUrl = 'https://france-geojson.gregoiredavid.fr/repo/departements/68-haut-rhin/departement-68-haut-rhin.geojson';
        
        const [basRhin, hautRhin] = await Promise.all([
            d3.json(alsaceUrl),
            d3.json(hautRhinUrl)
        ]);
        
        alsaceBackground = {
            type: 'FeatureCollection',
            features: [basRhin, hautRhin]
        };
        
        console.log('✅ Fond de carte chargé');
    } catch (error) {
        console.warn('⚠️ Impossible de charger le fond, utilisation d\'un fallback');
        alsaceBackground = null;
    }
    
    // ✨ CORRECTION : Utiliser TOUTES les données vignes pour calculer la projection
    const bounds = d3.geoBounds(vineyardData);
    console.log('📏 Limites géographiques:', bounds);
    
    // Projection adaptée à l'Alsace
    const projection = d3.geoMercator()
        .center([7.45, 48.3]) // Centre de l'Alsace
        .scale(15000) // ⬆️ Augmenter pour un zoom adapté
        .translate([width / 2, height / 2]);
    
    const path = d3.geoPath().projection(projection);
    
    // Message initial
    svg.append('text')
        .attr('id', 'empty-map-message')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '18px')
        .style('fill', '#999')
        .style('font-weight', 'bold')
        .text('Sélectionnez un département pour afficher les parcelles');
    
    // Échelle de couleur
    const slopeExtent = d3.extent(vineyardData.features, d => d.properties.pente_mean);
    const colorScale = d3.scaleSequential()
        .domain(slopeExtent)
        .interpolator(d3.interpolateRdYlGn);
    
    // Tooltip
    const tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0);
    
    // ✨ Layer du fond de carte
    const gBackground = svg.append('g')
        .attr('id', 'background-layer');
    
    // Dessiner le fond de carte si disponible
    if (alsaceBackground) {
        gBackground.selectAll('path.department')
            .data(alsaceBackground.features)
            .join('path')
            .attr('class', 'department')
            .attr('d', path)
            .attr('fill', '#f9f9f9')
            .attr('stroke', '#aaa')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5') // Contour en pointillés
            .attr('opacity', 0.5);
    } else {
        // ✨ Fallback : dessiner un rectangle englobant
        const [[x0, y0], [x1, y1]] = bounds;
        const bbox = {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]
                ]]
            }
        };
        
        gBackground.append('path')
            .datum(bbox)
            .attr('d', path)
            .attr('fill', '#f9f9f9')
            .attr('stroke', '#999')
            .attr('stroke-width', 2);
    }
    
    // Layer des vignes (au-dessus)
    const g = svg.append('g')
        .attr('id', 'vineyard-layer');
    
    // Zoom
    const zoom = d3.zoom()
        .scaleExtent([1, 50]) // ⬆️ Permettre plus de zoom
        .on('zoom', (event) => {
            gBackground.attr('transform', event.transform);
            g.attr('transform', event.transform);
        });
    
    svg.call(zoom);
    
    // Stocker les éléments
    mapElements = {
        svg, g, gBackground, path, colorScale, tooltip, zoom, projection
    };
    
    // Dessiner initialement
    updateMap();
    
    // Légende
    createLegend(colorScale, slopeExtent, 'Pente (%)');
    
    // Bouton reset zoom
    d3.select('#map-container').append('button')
        .attr('id', 'reset-zoom')
        .style('position', 'absolute')
        .style('top', '10px')
        .style('right', '10px')
        .text('↻ Réinitialiser le zoom')
        .on('click', () => {
            svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
        });
    
    // ✨ NOUVEAU : Bouton "Centrer sur les parcelles"
    d3.select('#map-container').append('button')
        .attr('id', 'fit-data')
        .style('position', 'absolute')
        .style('top', '50px')
        .style('right', '10px')
        .text('🎯 Centrer sur les parcelles')
        .on('click', fitToData);
}

// ✨ NOUVELLE FONCTION : Centrer la carte sur les parcelles visibles
function fitToData() {
    if (!filteredData || filteredData.features.length === 0) {
        alert('Aucune parcelle à afficher. Sélectionnez un département d\'abord.');
        return;
    }
    
    const { svg, projection, zoom } = mapElements;
    const width = +svg.attr('width');
    const height = +svg.attr('height');
    
    // Calculer les limites des parcelles filtrées
    const bounds = d3.geoBounds(filteredData);
    const [[x0, y0], [x1, y1]] = bounds.map(projection);
    
    // Calculer le zoom et la translation nécessaires
    const dx = x1 - x0;
    const dy = y1 - y0;
    const x = (x0 + x1) / 2;
    const y = (y0 + y1) / 2;
    const scale = Math.min(40, 0.9 / Math.max(dx / width, dy / height));
    const translate = [width / 2 - scale * x, height / 2 - scale * y];
    
    // Appliquer la transformation
    svg.transition()
        .duration(750)
        .call(
            zoom.transform,
            d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
        );
}

// Fonction pour créer une bbox de fallback
function createBoundingBox() {
    // Coordonnées approximatives de l'Alsace
    return {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [6.8, 47.4], // Sud-Ouest
                    [7.6, 47.4], // Sud-Est
                    [7.6, 49.1], // Nord-Est
                    [6.8, 49.1], // Nord-Ouest
                    [6.8, 47.4]  // Fermeture
                ]]
            }
        }]
    };
}

// Mettre à jour la carte avec les données filtrées
function updateMap() {
    const { g, path, colorScale, tooltip } = mapElements;
    
    // Mise à jour des parcelles
    const parcels = g.selectAll('path')
        .data(filteredData.features, d => d.properties.ID_PARCEL); // Key function
    
    // Supprimer les parcelles filtrées
    parcels.exit()
        .transition()
        .duration(300)
        .attr('opacity', 0)
        .remove();
    
    // Ajouter les nouvelles
    const parcelsEnter = parcels.enter()
        .append('path')
        .attr('class', 'vineyard-parcel')
        .attr('d', path)
        .attr('opacity', 0);
    
    // Mettre à jour toutes les parcelles
    parcels.merge(parcelsEnter)
        .transition()
        .duration(300)
        .attr('d', path)
        .attr('fill', d => {
            const slope = d.properties.pente_mean;
            return slope != null ? colorScale(slope) : '#ddd';
        })
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .attr('opacity', 0.9);
    
    // Events sur toutes les parcelles
    g.selectAll('path')
        .on('mouseover', function(event, d) {
            d3.select(this)
                .attr('stroke', '#222')
                .attr('stroke-width', 2)
                .attr('opacity', 1);
            
            const communeName = d.properties.nom_commune || d.properties.com_parc || 'N/A';
            
            tooltip.transition().duration(200).style('opacity', 1);
            tooltip.html(`
                <strong>📍 ${communeName}</strong><br>
                <strong>Dép:</strong> ${d.properties.dep_parc}<br>
                <strong>📐 Pente:</strong> ${d.properties.pente_mean?.toFixed(1)}%<br>
                <strong>🧭 Exposition:</strong> ${d.properties.expo_mean?.toFixed(0)}°<br>
                <strong>⛰️ Altitude:</strong> ${d.properties.alt_mean?.toFixed(0)}m<br>
                <strong>📏 Surface:</strong> ${d.properties.SURF_PARC?.toFixed(2)} ha
            `)
            .style('left', (event.pageX + 15) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this)
                .attr('stroke', '#fff')
                .attr('stroke-width', 0.5)
                .attr('opacity', 0.9);
            tooltip.transition().duration(500).style('opacity', 0);
        });
}

// ============================================
// GRAPHIQUES
// ============================================
function createCharts() {
    createHistogram('#slope-chart', 'pente_mean', 'Pente (%)', 20);
    createHistogram('#altitude-chart', 'alt_mean', 'Altitude (m)', 20);
}

// ✨ NOUVEAU : Mettre à jour les graphiques
function updateCharts() {
    d3.select('#slope-chart').selectAll('*').remove();
    d3.select('#altitude-chart').selectAll('*').remove();
    
    createHistogram('#slope-chart', 'pente_mean', 'Pente (%)', 20);
    createHistogram('#altitude-chart', 'alt_mean', 'Altitude (m)', 20);
}

function createHistogram(selector, property, label, bins) {
    const width = 350;
    const height = 180;
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    
    const svg = d3.select(selector)
        .attr('width', width)
        .attr('height', height);
    
    // ✨ Utiliser filteredData au lieu de vineyardData
    const values = filteredData.features
        .map(d => d.properties[property])
        .filter(v => v != null);
    
    if (values.length === 0) {
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height / 2)
            .attr('text-anchor', 'middle')
            .text('Aucune donnée');
        return;
    }
    
    // ...existing code (reste du code de createHistogram)...
    const x = d3.scaleLinear()
        .domain(d3.extent(values))
        .range([margin.left, width - margin.right]);
    
    const histogram = d3.histogram()
        .domain(x.domain())
        .thresholds(bins);
    
    const binData = histogram(values);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(binData, d => d.length)])
        .range([height - margin.bottom, margin.top]);
    
    svg.selectAll('rect')
        .data(binData)
        .join('rect')
        .attr('x', d => x(d.x0) + 1)
        .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 2))
        .attr('y', d => y(d.length))
        .attr('height', d => y(0) - y(d.length))
        .attr('fill', '#667eea');
    
    svg.append('g')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(5));
    
    svg.append('g')
        .attr('transform', `translate(${margin.left},0)`)
        .call(d3.axisLeft(y));
    
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height - 5)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .text(label);
}

// ============================================
// LÉGENDE
// ============================================
function createLegend(colorScale, extent, label) {
    // ...existing code (inchangé)...
    const legend = d3.select('#map-legend');
    legend.html('');
    
    const legendSvg = legend.append('svg')
        .attr('width', 300)
        .attr('height', 60);
    
    const gradient = legendSvg.append('defs')
        .append('linearGradient')
        .attr('id', 'legend-gradient');
    
    gradient.selectAll('stop')
        .data([0, 0.25, 0.5, 0.75, 1])
        .join('stop')
        .attr('offset', d => `${d * 100}%`)
        .attr('stop-color', d => colorScale(extent[0] + d * (extent[1] - extent[0])));
    
    legendSvg.append('rect')
        .attr('x', 10)
        .attr('y', 10)
        .attr('width', 200)
        .attr('height', 20)
        .style('fill', 'url(#legend-gradient)');
    
    legendSvg.append('text')
        .attr('x', 10)
        .attr('y', 45)
        .text(`${extent[0].toFixed(1)}%`);
    
    legendSvg.append('text')
        .attr('x', 180)
        .attr('y', 45)
        .text(`${extent[1].toFixed(1)}%`);
    
    legendSvg.append('text')
        .attr('x', 220)
        .attr('y', 25)
        .style('font-weight', 'bold')
        .text(label);
}

// ============================================
// STATISTIQUES
// ============================================
function updateStats() {
    const features = filteredData.features; // ✨ Utiliser filteredData
    
    const stats = {
        count: features.length,
        avgSlope: d3.mean(features, d => d.properties.pente_mean),
        avgAlt: d3.mean(features, d => d.properties.alt_mean),
        departments: [...new Set(features.map(d => d.properties.dep_parc))].join(', ')
    };
    
    d3.select('#stats-content').html(`
        <p><strong>Parcelles:</strong> ${stats.count.toLocaleString()}</p>
        <p><strong>Pente moyenne:</strong> ${stats.avgSlope?.toFixed(1) || 'N/A'}%</p>
        <p><strong>Altitude moyenne:</strong> ${stats.avgAlt?.toFixed(0) || 'N/A'}m</p>
        <p><strong>Départements:</strong> ${stats.departments || 'N/A'}</p>
    `);
}

// ============================================
// INITIALISATION
// ============================================
loadData();