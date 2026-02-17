// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    dataPath: 'data/processed/vignes.geojson',
    colors: {
        slope: d3.interpolateRdYlGn,
        altitude: d3.interpolateViridis,
        exposure: d3.interpolateRdYlBu
    },
    map: {
        width: 900,
        height: 700,
        center: [7.5, 48.25],    // ✅ Centre ajusté
        scale: 50000              // ✅ Zoom beaucoup plus fort (était 15000)
    }
};

// ============================================
// VARIABLES GLOBALES
// ============================================
let vineyardData = null;
let filteredData = null;
let mapElements = null;
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
        console.log('Chargement des données...');
        vineyardData = await d3.json(CONFIG.dataPath);
        console.log(`${vineyardData.features.length} parcelles chargées`);
        
        filteredData = vineyardData;
        
        initFilters();
        initMap();
        createCharts();
        updateStats();
        
    } catch (error) {
        console.error('Erreur de chargement:', error);
        d3.select('main').html(`
            <div style="text-align: center; padding: 50px; color: #e74c3c;">
                <h2>Erreur de chargement des données</h2>
                <p>Impossible de charger ${CONFIG.dataPath}</p>
                <p>Détails: ${error.message}</p>
            </div>
        `);
    }
}

// ============================================
// INITIALISATION DE LA CARTE
// ============================================
async function initMap() {
    const { width, height, center, scale } = CONFIG.map;
    
    const svg = d3.select('#map')
        .attr('width', width)
        .attr('height', height);
    
    // Projection Mercator centrée sur l'Alsace
    const projection = d3.geoMercator()
        .center(center)
        .scale(scale)
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
    
    // Échelle de couleur pour la pente
    const slopeExtent = d3.extent(vineyardData.features, d => d.properties.pente_mean);
    const colorScale = d3.scaleSequential()
        .domain(slopeExtent)
        .interpolator(CONFIG.colors.slope);
    
    // Tooltip
    const tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0);
    
    // Layer des vignes
    const g = svg.append('g')
        .attr('id', 'vineyard-layer');
    
    // Zoom
    const zoom = d3.zoom()
        .scaleExtent([1, 50])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
        });
    
    svg.call(zoom);
    
    // Stocker les éléments
    mapElements = {
        svg, g, path, colorScale, tooltip, zoom, projection
    };
    
    // Dessiner les parcelles
    updateMap();
    
    // Créer la légende
    createLegend(colorScale, slopeExtent, 'Pente (%)');
    
    // Bouton reset zoom
    d3.select('#map-container').append('button')
        .attr('id', 'reset-zoom')
        .style('position', 'absolute')
        .style('top', '10px')
        .style('right', '10px')
        .text('Réinitialiser le zoom')
        .on('click', () => {
            svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
        });
    
    // Bouton centrer sur les données
    d3.select('#map-container').append('button')
        .attr('id', 'fit-data')
        .style('position', 'absolute')
        .style('top', '50px')
        .style('right', '10px')
        .text('Centrer sur les parcelles')
        .on('click', fitToData);
}

// ============================================
// MISE À JOUR DE LA CARTE
// ============================================
function updateMap() {
    const { g, path, colorScale, tooltip } = mapElements;
    
    // Message si aucune donnée
    if (!filteredData || filteredData.features.length === 0) {
        d3.select('#empty-map-message').style('display', 'block');
        g.selectAll('path').remove();
        return;
    }
    
    d3.select('#empty-map-message').style('display', 'none');

    g.selectAll('path').remove();
    
    // Data join
    const parcels = g.selectAll('path')
        .data(filteredData.features, d => d.properties.ID_PARCEL);
    
    // Exit
    parcels.exit()
        .transition()
        .duration(300)
        .attr('opacity', 0)
        .remove();
    
    // Enter
    const parcelsEnter = parcels.enter()
        .append('path')
        .attr('class', 'vineyard-parcel')
        .attr('d', path)
        .attr('opacity', 0);
    
    // Update + Enter
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
    
    // Interactions
    g.selectAll('path')
        .on('mouseover', function(event, d) {
            d3.select(this)
                .attr('stroke', '#222')
                .attr('stroke-width', 2)
                .attr('opacity', 1);
            
            const props = d.properties;
            const communeName = props.nom_commune || props.com_parc || 'Inconnue';
            const appellation = props.appellation || 'Non renseignée';
            
            // Données de production (si disponibles)
            const hasProduction = props.volume_production_hl != null;
            let productionHtml = '';
            
            if (hasProduction) {
                productionHtml = `
                    <hr style="margin: 8px 0; border: 0; border-top: 1px solid rgba(255,255,255,0.3);">
                    <strong>Production (commune):</strong><br>
                    Volume: ${props.volume_production_hl.toFixed(0)} hl<br>
                    Surface: ${props.superficie_production_ha.toFixed(1)} ha<br>
                    Rendement: ${props.rendement_moyen_hl_ha.toFixed(0)} hl/ha
                `;
            }
            
            tooltip.transition().duration(200).style('opacity', 1);
            tooltip.html(`
                <strong>${communeName}</strong><br>
                <strong>Appellation:</strong> ${appellation}<br>
                <strong>Département:</strong> ${props.dep_parc}<br>
                <strong>Pente:</strong> ${props.pente_mean?.toFixed(1) || 'N/A'}%<br>
                <strong>Exposition:</strong> ${props.expo_mean?.toFixed(0) || 'N/A'}°<br>
                <strong>Altitude:</strong> ${props.alt_mean?.toFixed(0) || 'N/A'}m<br>
                <strong>Surface parcelle:</strong> ${props.SURF_PARC?.toFixed(2) || 'N/A'} ha
                ${productionHtml}
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

    if (filteredData === vineyardData) {
        // Premier chargement : centrer sur toutes les parcelles
        setTimeout(fitToData, 100);
    }
}

// ============================================
// CENTRER LA VUE SUR LES DONNÉES
// ============================================
function fitToData() {
    if (!filteredData || filteredData.features.length === 0) {
        alert('Aucune parcelle à afficher. Sélectionnez un département.');
        return;
    }
    
    const { svg, projection, zoom } = mapElements;
    const width = +svg.attr('width');
    const height = +svg.attr('height');
    
    // Calculer les limites
    const bounds = d3.geoBounds(filteredData);
    const [[x0, y0], [x1, y1]] = bounds.map(projection);
    
    // Calculer le zoom et la translation
    const dx = x1 - x0;
    const dy = y1 - y0;
    const x = (x0 + x1) / 2;
    const y = (y0 + y1) / 2;
    const scale = Math.min(40, 0.9 / Math.max(dx / width, dy / height));
    const translate = [width / 2 - scale * x, height / 2 - scale * y];
    
    // Animer la transformation
    svg.transition()
        .duration(750)
        .call(
            zoom.transform,
            d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
        );
}

// ============================================
// CRÉATION DE LA LÉGENDE
// ============================================
function createLegend(colorScale, extent, label) {
    const legendWidth = 300;
    const legendHeight = 20;
    
    const legendSvg = d3.select('#legend')
        .append('svg')
        .attr('width', legendWidth + 60)
        .attr('height', legendHeight + 40);
    
    // Gradient
    const defs = legendSvg.append('defs');
    const gradient = defs.append('linearGradient')
        .attr('id', 'legend-gradient')
        .attr('x1', '0%')
        .attr('x2', '100%');
    
    const numStops = 10;
    for (let i = 0; i <= numStops; i++) {
        const offset = i / numStops;
        const value = extent[0] + offset * (extent[1] - extent[0]);
        gradient.append('stop')
            .attr('offset', `${offset * 100}%`)
            .attr('stop-color', colorScale(value));
    }
    
    // Rectangle de la légende
    legendSvg.append('rect')
        .attr('x', 10)
        .attr('y', 10)
        .attr('width', legendWidth)
        .attr('height', legendHeight)
        .style('fill', 'url(#legend-gradient)')
        .style('stroke', '#333')
        .style('stroke-width', 1);
    
    // Axe
    const legendScale = d3.scaleLinear()
        .domain(extent)
        .range([10, legendWidth + 10]);
    
    const legendAxis = d3.axisBottom(legendScale)
        .ticks(5)
        .tickFormat(d => d.toFixed(1));
    
    legendSvg.append('g')
        .attr('transform', `translate(0, ${legendHeight + 10})`)
        .call(legendAxis);
    
    // Label
    legendSvg.append('text')
        .attr('x', legendWidth / 2 + 10)
        .attr('y', legendHeight + 40)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .text(label);
}

// ============================================
// INITIALISATION DES FILTRES
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

// ============================================
// APPLICATION DES FILTRES
// ============================================
function applyFilters() {
    filteredData = {
        type: 'FeatureCollection',
        features: vineyardData.features.filter(feature => {
            const props = feature.properties;
            
            // Filtre département
            if (currentFilters.department !== 'none' && props.dep_parc !== currentFilters.department) {
                return false;
            }
            
            // Filtre pente
            if (props.pente_mean != null && props.pente_mean < currentFilters.slopeMin) {
                return false;
            }
            
            // Filtre altitude
            if (props.alt_mean != null) {
                if (props.alt_mean < currentFilters.altitudeMin || props.alt_mean > currentFilters.altitudeMax) {
                    return false;
                }
            }
            
            return true;
        })
    };
    
    updateMap();
    createCharts();
    updateStats();
}

// ============================================
// RÉINITIALISATION DES FILTRES
// ============================================
function resetFilters() {
    currentFilters = {
        department: 'none',
        slopeMin: 0,
        altitudeMin: 0,
        altitudeMax: 500
    };
    
    d3.select('#dept-filter').property('value', 'none');
    d3.select('#slope-filter').property('value', 0);
    d3.select('#slope-value').text('0%');
    d3.select('#altitude-min').property('value', 0);
    d3.select('#altitude-max').property('value', 500);
    updateAltitudeLabel();
    
    applyFilters();
}

// ============================================
// MISE À JOUR LABEL ALTITUDE
// ============================================
function updateAltitudeLabel() {
    const min = d3.select('#altitude-min').property('value');
    const max = d3.select('#altitude-max').property('value');
    d3.select('#altitude-value').text(`${min}m - ${max}m`);
}

// ============================================
// CRÉATION DES GRAPHIQUES
// ============================================
function createCharts() {
    createHistogram('#slope-chart', 'pente_mean', 'Pente (%)', 20);
    createHistogram('#altitude-chart', 'alt_mean', 'Altitude (m)', 20);
}

// ============================================
// HISTOGRAMME GÉNÉRIQUE
// ============================================
function createHistogram(selector, property, label, numBins) {
    const width = 450;
    const height = 300;
    const margin = { top: 20, right: 20, bottom: 60, left: 60 };
    
    d3.select(selector).selectAll('*').remove();
    
    const svg = d3.select(selector)
        .append('svg')
        .attr('width', width)
        .attr('height', height);
    
    // Données
    const values = filteredData.features
        .map(f => f.properties[property])
        .filter(v => v != null);
    
    if (values.length === 0) {
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height / 2)
            .attr('text-anchor', 'middle')
            .style('fill', '#999')
            .text('Aucune donnée disponible');
        return;
    }
    
    // Histogramme
    const x = d3.scaleLinear()
        .domain(d3.extent(values))
        .range([margin.left, width - margin.right]);
    
    const bins = d3.histogram()
        .domain(x.domain())
        .thresholds(numBins)(values);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(bins, d => d.length)])
        .range([height - margin.bottom, margin.top]);
    
    // Barres
    svg.selectAll('rect')
        .data(bins)
        .join('rect')
        .attr('x', d => x(d.x0) + 1)
        .attr('y', d => y(d.length))
        .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 2))
        .attr('height', d => y(0) - y(d.length))
        .attr('fill', '#667eea')
        .attr('opacity', 0.8);
    
    // Axes
    svg.append('g')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(8));
    
    svg.append('g')
        .attr('transform', `translate(${margin.left},0)`)
        .call(d3.axisLeft(y));
    
    // Label X
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height - 10)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .text(label);
    
    // Label Y
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', 15)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .text('Nombre de parcelles');
}

// ============================================
// MISE À JOUR DES STATISTIQUES
// ============================================
function updateStats() {
    const features = filteredData.features;
    
    if (features.length === 0) {
        d3.select('#stats-content').html('<p>Aucune parcelle sélectionnée</p>');
        return;
    }
    
    // Statistiques de base
    const stats = {
        count: features.length,
        avgSlope: d3.mean(features, d => d.properties.pente_mean),
        avgAlt: d3.mean(features, d => d.properties.alt_mean),
        departments: [...new Set(features.map(d => d.properties.dep_parc))].join(', ')
    };
    
    // Statistiques appellations
    const appellations = features.reduce((acc, f) => {
        const app = f.properties.appellation || 'Non renseignée';
        acc[app] = (acc[app] || 0) + 1;
        return acc;
    }, {});
    
    const nbGrandsCrus = Object.entries(appellations)
        .filter(([name, _]) => name.includes('Grand Cru'))
        .reduce((sum, [_, count]) => sum + count, 0);
    
    // Statistiques production
    const parcellesAvecProd = features.filter(f => f.properties.volume_production_hl != null);
    const hasProdData = parcellesAvecProd.length > 0;
    
    let prodHtml = '';
    if (hasProdData) {
        const avgVol = d3.mean(parcellesAvecProd, d => d.properties.volume_production_hl);
        prodHtml = `<p><strong>Production moyenne (commune):</strong> ${avgVol.toFixed(0)} hl</p>`;
    }
    
    // Affichage
    d3.select('#stats-content').html(`
        <p><strong>Parcelles:</strong> ${stats.count.toLocaleString()}</p>
        <p><strong>Grands Crus:</strong> ${nbGrandsCrus} (${(nbGrandsCrus/stats.count*100).toFixed(1)}%)</p>
        <p><strong>Pente moyenne:</strong> ${stats.avgSlope?.toFixed(1) || 'N/A'}%</p>
        <p><strong>Altitude moyenne:</strong> ${stats.avgAlt?.toFixed(0) || 'N/A'}m</p>
        <p><strong>Départements:</strong> ${stats.departments || 'N/A'}</p>
        ${prodHtml}
    `);
}

// ============================================
// INITIALISATION
// ============================================
loadData();