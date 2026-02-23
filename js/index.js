// Global variables
let dataProd = null;
let dataSoleil = null;
let dataTopo = null;
let departments = null;
let departementSelectionne = null;
let choixVin = 'total_prod';
let metricTopo = 'altitude';
let facteurX = 'soleil';

// Helper function to create color legend
function createColorLegend(colorScale, domain, unit = "", width = 300) {
    // 1. Sécurité : Vérifier que le domaine est valide pour éviter les NaN
    const safeDomain = (isNaN(domain[0]) || isNaN(domain[1])) ? [0, 100] : domain;
    
    const margin = { top: 5, right: 20, bottom: 25, left: 20 };
    const barHeight = 15;
    const innerWidth = width - margin.left - margin.right;

    // Création du conteneur
    const container = d3.create("div").attr("class", "legend-container");
    
    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", barHeight + margin.top + margin.bottom);

    // 2. Définition du dégradé (Gradient)
    const defs = svg.append("defs");
    const gradientId = "gradient-" + Math.random().toString(36).substring(2, 9);
    
    const linearGradient = defs.append("linearGradient")
        .attr("id", gradientId)
        .attr("x1", "0%").attr("y1", "0%")
        .attr("x2", "100%").attr("y2", "0%");

    // On crée 10 points d'arrêt pour un dégradé fluide
    const stops = 10;
    for (let i = 0; i <= stops; i++) {
        const offset = i / stops;
        const value = safeDomain[0] + offset * (safeDomain[1] - safeDomain[0]);
        linearGradient.append("stop")
            .attr("offset", `${offset * 100}%`)
            .attr("stop-color", colorScale(value));
    }

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // 3. Dessin du rectangle
    g.append("rect")
        .attr("width", innerWidth)
        .attr("height", barHeight)
        .style("fill", `url(#${gradientId})`);

    // 4. Création de l'axe (Valeurs)
    const axisScale = d3.scaleLinear()
        .domain(safeDomain)
        .range([0, innerWidth]);

    const axis = d3.axisBottom(axisScale)
        .ticks(5)
        .tickFormat(d => d3.format(".0s")(d) + unit); // Formatage compact (ex: 10k hl)

    g.append("g")
        .attr("transform", `translate(0, ${barHeight})`)
        .call(axis)
        .select(".domain").remove(); // On enlève la ligne de l'axe pour plus de clarté

    return container.node(); // Retourne l'élément DOM prêt à être inséré
}

// Helper function to create tooltip
function createTooltip() {
    return d3.select("body")
        .append("div")
        .attr("class", "svg-tooltip")
        .style("visibility", "hidden");
}

// Load all data
async function loadData() {
    try {
        const [prodData, deptData, sunData, topoData] = await Promise.all([
            d3.csv("data/processed/production_vins_2024_clean.csv", d3.autoType),
            d3.json("https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements.geojson"),
            d3.csv("data/processed/ensoleillement_france_2024.csv", d3.autoType),
            d3.csv("data/processed/topo_par_departement.csv", d3.autoType),
        ]);

        dataProd = prodData;
        departments = deptData;
        dataSoleil = sunData;
        dataTopo = topoData;
        
        renderProductionDashboard();
        renderSunshineDashboard();
        renderTopographyDashboard();
        renderImpactDashboard();
    } catch (error) {
        document.getElementById('production-dashboard').innerHTML = 
            `<div style="color: red; padding: 20px;">Erreur de chargement : ${error.message}</div>`;
    }
}

// Render Production Dashboard
function renderProductionDashboard() {
    if (!dataProd || !departments) {
        document.getElementById('production-dashboard').innerHTML = 
            '<div class="loading">Chargement des données de production...</div>';
        return;
    }

    const widthMap = 500;
    const heightMap = 500;
    const widthChart = 500;
    const heightChart = 500;

    const metric = choixVin;
    const selection = departementSelectionne;
    const codeSelection = selection ? selection.code : null;

    const themes = {
        total_prod: { scale: d3.interpolatePuRd, color: "#8e24aa", label: "Production Totale" },
        total_rouge: { scale: d3.interpolateReds, color: "#d32f2f", label: "Vin Rouge" },
        total_blanc: { scale: d3.interpolateYlGn, color: "#9ccc65", label: "Vin Blanc" },
        total_rose: { scale: d3.interpolateRdPu, color: "#f06292", label: "Vin Rosé" }
    };

    const theme = themes[metric] || themes.total_prod;
    const mapInterpolator = theme.scale;
    const barColorBase = theme.color;
    const titleLabel = theme.label;

    // Create tooltip
    const tooltip = createTooltip();

    // Create SVG for map
    const svgMap = d3.create("svg")
        .attr("width", widthMap)
        .attr("height", heightMap)
        .attr("viewBox", [0, 0, widthMap, heightMap]);

    const projection = d3.geoConicConformal()
        .center([2.454071, 46.279229])
        .scale(2600)
        .translate([widthMap / 2, heightMap / 2]);
    const path = d3.geoPath().projection(projection);

    const maxVal = d3.max(dataProd, d => d[metric]) || 10000;
    const colorScaleMap = d3.scaleSequential([0, maxVal], mapInterpolator);

    const geojson = JSON.parse(JSON.stringify(departments));
    for (const feature of geojson.features) {
        const depCode = feature.properties.code;
        const row = dataProd.find(d => String(d.code_dept).padStart(2, '0') === depCode);
        feature.properties.value = row ? row[metric] : 0;
        feature.properties.code = depCode;
    }

    const g = svgMap.append("g");
    const paths = g.selectAll("path")
        .data(geojson.features)
        .join("path")
        .attr("d", path)
        .attr("fill", d => d.properties.value > 0 ? colorScaleMap(d.properties.value) : "#eee")
        .attr("stroke", "white")
        .attr("stroke-width", 0.5)
        .attr("cursor", "pointer");

    paths.filter(d => d.properties.code === codeSelection)
        .attr("stroke", "#000").attr("stroke-width", 2.5).raise();

    paths.on("click", (e, d) => {
            departementSelectionne = d.properties;
            renderProductionDashboard();
            renderSunshineDashboard();
            renderTopographyDashboard();
        })
        .on("mouseover", function(event, d) {
            d3.select(this).attr("stroke", "#333").attr("stroke-width", 2).raise();
            tooltip.style("visibility", "visible")
                .html(`<strong>${d.properties.nom}</strong><br/>${titleLabel} : <strong>${Math.round(d.properties.value).toLocaleString()} hl</strong>`);
        })
        .on("mousemove", function(event) {
            tooltip.style("top", (event.pageY - 10) + "px")
                .style("left", (event.pageX + 10) + "px");
        })
        .on("mouseout", function(e, d) {
            const isSel = d.properties.code === codeSelection;
            d3.select(this).attr("stroke", isSel ? "#000" : "white")
                .attr("stroke-width", isSel ? 2.5 : 0.5);
            if (!isSel && codeSelection) {
                paths.filter(p => p.properties.code === codeSelection).raise();
            }
            tooltip.style("visibility", "hidden");
        });

    // Create bar chart
    const topData = [...dataProd]
        .sort((a, b) => d3.descending(a[metric], b[metric]))
        .slice(0, 15);

    const chart = Plot.plot({
        title: `Top 15 : ${titleLabel} (hl)`,
        marginLeft: 120,
        width: widthChart,
        height: heightChart,
        x: { label: null, grid: true, tickFormat: "s" },
        y: { label: null },
        marks: [
            Plot.barX(topData, {
                x: metric,
                y: "nom_dept",
                fill: d => String(d.code_dept).padStart(2, '0') === codeSelection ? "#222" : barColorBase,
                sort: { y: "x", reverse: true }
            }),
            Plot.text(topData, {
                x: metric,
                y: "nom_dept",
                text: d => (d[metric] / 1000).toFixed(0) + "k",
                textAnchor: "start",
                dx: 5,
                fill: "#444",
                fontSize: 10
            })
        ]
    });

    // Assemble the dashboard
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "flex-start";
    div.style.gap = "20px";

    const left = document.createElement("div");
    left.appendChild(svgMap.node());
    
    // Add color legend for map
    const legend = createColorLegend(colorScaleMap, [0, maxVal], "hl", 300);
    left.appendChild(legend);

    const right = document.createElement("div");
    right.appendChild(chart);

    div.appendChild(left);
    div.appendChild(right);
    
    // Add data source
    const source = document.createElement("div");
    source.className = "data-source";
    source.textContent = "Source : Données de production viticole France 2024 (FranceAgriMer, Agreste)";
    
    // Update container
    const dashboardContainer = document.getElementById('production-dashboard');
    dashboardContainer.innerHTML = '';
    dashboardContainer.appendChild(div);
    dashboardContainer.appendChild(source);
}

// Render Sunshine Dashboard
function renderSunshineDashboard() {
    if (!dataSoleil || !departments) {
        document.getElementById('sunshine-dashboard').innerHTML = 
            '<div class="loading">Chargement des données d\'ensoleillement...</div>';
        return;
    }

    const widthMap = 500;
    const heightMap = 500;
    const widthChart = 500;
    const heightChart = 500;

    const selection = departementSelectionne;
    const codeSelection = selection ? selection.code : null;

    // Create tooltip
    const tooltip = createTooltip();

    // Create SVG for map
    const svgMap = d3.create("svg")
        .attr("width", widthMap)
        .attr("height", heightMap)
        .attr("viewBox", [0, 0, widthMap, heightMap]);

    const projection = d3.geoConicConformal()
        .center([2.454071, 46.279229])
        .scale(2600)
        .translate([widthMap / 2, heightMap / 2]);
    const path = d3.geoPath().projection(projection);

    const maxVal = d3.max(dataSoleil, d => d.heures_soleil) || 3000;
    const colorScaleMap = d3.scaleSequential([0, maxVal], d3.interpolateYlOrRd);

    const geojson = JSON.parse(JSON.stringify(departments));
    for (const feature of geojson.features) {
        const depCode = feature.properties.code;
        const row = dataSoleil.find(d => String(d.code_dept).padStart(2, '0') === depCode);
        feature.properties.value = row ? row.heures_soleil : 0;
        feature.properties.code = depCode;
    }

    const g = svgMap.append("g");
    const paths = g.selectAll("path")
        .data(geojson.features)
        .join("path")
        .attr("d", path)
        .attr("fill", d => d.properties.value > 0 ? colorScaleMap(d.properties.value) : "#eee")
        .attr("stroke", "white")
        .attr("stroke-width", 0.5)
        .attr("cursor", "pointer");

    paths.filter(d => d.properties.code === codeSelection)
        .attr("stroke", "#000").attr("stroke-width", 2.5).raise();

    paths.on("click", (e, d) => {
            departementSelectionne = d.properties;
            renderProductionDashboard();
            renderSunshineDashboard();
            renderTopographyDashboard();
        })
        .on("mouseover", function(event, d) {
            d3.select(this).attr("stroke", "#333").attr("stroke-width", 2).raise();
            tooltip.style("visibility", "visible")
                .html(`<strong>${d.properties.nom}</strong><br/>Ensoleillement : <strong>${Math.round(d.properties.value).toLocaleString()} h/an</strong>`);
        })
        .on("mousemove", function(event) {
            tooltip.style("top", (event.pageY - 10) + "px")
                .style("left", (event.pageX + 10) + "px");
        })
        .on("mouseout", function(e, d) {
            const isSel = d.properties.code === codeSelection;
            d3.select(this).attr("stroke", isSel ? "#000" : "white")
                .attr("stroke-width", isSel ? 2.5 : 0.5);
            if (!isSel && codeSelection) {
                paths.filter(p => p.properties.code === codeSelection).raise();
            }
            tooltip.style("visibility", "hidden");
        });

    // Create bar chart
    const chart = Plot.plot({
        title: "Top 15 des départements les plus ensoleillés (en h/an)",
        marginLeft: 140,
        width: widthChart,
        height: heightChart,
        x: {
            label: "Heures d'ensoleillement",
            grid: true,
            tickFormat: "s"
        },
        y: {
            label: null
        },
        marks: [
            Plot.barX(dataSoleil, {
                x: "heures_soleil",
                y: "nom_dept",
                sort: { y: "x", reverse: true, limit: 15 },
                fill: d => {
                    const codeCurrent = String(d.code_dept).padStart(2, '0');
                    return codeCurrent === codeSelection ? "#d32f2f" : "#f39c12";
                },
                title: d => `${d.nom_dept}\n${d.heures_soleil.toLocaleString()} h/an`
            }),
            Plot.text(dataSoleil, {
                x: "heures_soleil",
                y: "nom_dept",
                text: d => (d.heures_soleil / 1000).toFixed(1) + "k",
                textAnchor: "start",
                dx: 5,
                fill: "#666",
                fontSize: 10,
                sort: { y: "x", reverse: true, limit: 15 }
            })
        ]
    });

    // Assemble the dashboard
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "flex-start";
    div.style.gap = "20px";

    const left = document.createElement("div");
    left.appendChild(svgMap.node());
    
    // Add color legend for map
    const legend = createColorLegend(colorScaleMap, [0, maxVal], " h/an", 300);
    left.appendChild(legend);

    const right = document.createElement("div");
    right.appendChild(chart);

    div.appendChild(left);
    div.appendChild(right);
    
    // Add data source
    const source = document.createElement("div");
    source.className = "data-source";
    source.textContent = "Source : Données météorologiques Météo-France 2024";

    // Update container
    const dashboardContainer = document.getElementById('sunshine-dashboard');
    dashboardContainer.innerHTML = '';
    dashboardContainer.appendChild(div);
    dashboardContainer.appendChild(source);
}

// Render Topography Dashboard
function renderTopographyDashboard() {
    if (!dataTopo || !departments) {
        document.getElementById('topography-dashboard').innerHTML = 
            '<div class="loading">Chargement des données topographiques...</div>';
        return;
    }

    const widthMap = 500;
    const heightMap = 500;
    const widthChart = 500;
    const heightChart = 500;
    
    const selection = departementSelectionne;
    const codeSelection = selection ? selection.code : null;
    const metric = metricTopo;

    // Create tooltip
    const tooltip = createTooltip();

    // Create a map of department codes to names from GeoJSON
    const deptNamesMap = new Map();
    departments.features.forEach(feature => {
        deptNamesMap.set(feature.properties.code, feature.properties.nom);
    });

    // Enrich topography data with department names
    const enrichedDataTopo = dataTopo.map(d => ({
        ...d,
        nom_dept: deptNamesMap.get(String(d.code_dep).padStart(2, '0')) || `Dept ${d.code_dep}`
    }));

    // Create SVG for map
    const svgMap = d3.create("svg")
        .attr("width", widthMap)
        .attr("height", heightMap)
        .attr("viewBox", [0, 0, widthMap, heightMap]);

    const projection = d3.geoConicConformal()
        .center([2.454071, 46.279229])
        .scale(2600)
        .translate([widthMap / 2, heightMap / 2]);
    const path = d3.geoPath().projection(projection);

    // Adapt scale based on metric
    let colorInterpolator;
    let domainMax;
    let chartTitle;
    let unit = "";
    let barColor;

    const maxValue = d3.max(enrichedDataTopo, d => d[metric]) || 100;

    if (metric === "pente") {
        colorInterpolator = d3.interpolateReds;
        domainMax = 15;
        chartTitle = "Top 15 : Pente moyenne";
        unit = "%";
        barColor = "#d32f2f";
    } else if (metric === "altitude") {
        colorInterpolator = d3.interpolateGnBu;
        domainMax = maxValue;
        chartTitle = "Top 15 : Altitude moyenne";
        unit = "m";
        barColor = "#1976d2";
    } else {
        colorInterpolator = d3.interpolateYlOrBr;
        domainMax = 360;
        chartTitle = "Top 15 : Exposition";
        unit = "°";
        barColor = "#f57c00";
    }

    const colorScale = d3.scaleSequential()
        .domain([0, domainMax])
        .interpolator(colorInterpolator);

    const geojson = JSON.parse(JSON.stringify(departments));

    for (const feature of geojson.features) {
        const depCode = feature.properties.code;
        const row = enrichedDataTopo.find(d => String(d.code_dep).padStart(2, '0') === depCode);
        feature.properties.topoData = row || null;
        feature.properties.value = row ? row[metric] : 0;
    }

    const g = svgMap.append("g");
    const paths = g.selectAll("path")
        .data(geojson.features)
        .join("path")
        .attr("d", path)
        .attr("fill", d => d.properties.value > 0 ? colorScale(d.properties.value) : "#eee")
        .attr("stroke", "white")
        .attr("stroke-width", 0.5)
        .attr("cursor", "pointer");

    paths.filter(d => d.properties.code === codeSelection)
        .attr("stroke", "#000")
        .attr("stroke-width", 2.5)
        .raise();

    paths
        .on("click", (event, d) => {
            departementSelectionne = d.properties;
            renderProductionDashboard();
            renderSunshineDashboard();
            renderTopographyDashboard();
        })
        .on("mouseover", function(event, d) {
            d3.select(this).attr("stroke", "#333").attr("stroke-width", 2).raise();
            const val = d.properties.value ? Math.round(d.properties.value * 10) / 10 : "N/A";
            tooltip.style("visibility", "visible")
                .html(`<strong>${d.properties.nom}</strong><br/>${metric.charAt(0).toUpperCase() + metric.slice(1)} : <strong>${val} ${unit}</strong>`);
        })
        .on("mousemove", function(event) {
            tooltip.style("top", (event.pageY - 10) + "px")
                .style("left", (event.pageX + 10) + "px");
        })
        .on("mouseout", function(e, d) {
            const isSel = d.properties.code === codeSelection;
            d3.select(this).attr("stroke", isSel ? "#000" : "white")
                .attr("stroke-width", isSel ? 2.5 : 0.5);
            if (!isSel && codeSelection) {
                paths.filter(p => p.properties.code === codeSelection).raise();
            }
            tooltip.style("visibility", "hidden");
        });

    // Create bar chart for topography
    const topData = enrichedDataTopo
        .filter(d => d[metric] > 0)
        .sort((a, b) => d3.descending(a[metric], b[metric]))
        .slice(0, 15);

    const chart = Plot.plot({
        title: chartTitle,
        marginLeft: 140,
        width: widthChart,
        height: heightChart,
        x: {
            label: unit,
            grid: true,
            tickFormat: "s"
        },
        y: {
            label: null
        },
        marks: [
            Plot.barX(topData, {
                x: metric,
                y: "nom_dept",
                sort: { y: "x", reverse: true },
                fill: d => {
                    const codeCurrent = String(d.code_dep).padStart(2, '0');
                    return codeCurrent === codeSelection ? "#222" : barColor;
                },
                title: d => `${d.nom_dept}\n${Math.round(d[metric] * 10) / 10} ${unit}`
            }),
            Plot.text(topData, {
                x: metric,
                y: "nom_dept",
                text: d => {
                    const val = d[metric];
                    if (metric === "exposition") {
                        return Math.round(val) + "°";
                    } else if (metric === "altitude") {
                        return Math.round(val) + "m";
                    } else {
                        return val.toFixed(1) + "%";
                    }
                },
                textAnchor: "start",
                dx: 5,
                fill: "#666",
                fontSize: 10
            })
        ]
    });

    // Assemble the dashboard
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "flex-start";
    div.style.gap = "20px";

    const left = document.createElement("div");
    left.appendChild(svgMap.node());
    
    // Add color legend for map
    const legend = createColorLegend(colorScale, [0, domainMax], unit, 300);
    left.appendChild(legend);

    const right = document.createElement("div");
    right.appendChild(chart);

    div.appendChild(left);
    div.appendChild(right);
    
    // Add data source
    const source = document.createElement("div");
    source.className = "data-source";
    source.textContent = "Source : Modèle Numérique de Terrain (IGN, BD ALTI)";

    // Update container
    const dashboardContainer = document.getElementById('topography-dashboard');
    dashboardContainer.innerHTML = '';
    dashboardContainer.appendChild(div);
    dashboardContainer.appendChild(source);
}

// Render Impact Dashboard
function renderImpactDashboard() {
    if (!dataProd || !dataSoleil || !dataTopo || !departments) {
        document.getElementById('impact-dashboard').innerHTML = 
            '<div class="loading">Chargement de l\'analyse d\'impact...</div>';
        return;
    }

    const selection = departementSelectionne; 
    const codeSelection = selection ? selection.code : null;
    const metric = facteurX;

    const width = 850;
    const heightMap = 600;
    const heightPlot = 350;

    // Create tooltip
    const tooltip = createTooltip();

    // Préparation des données
    const topoMap = new Map(dataTopo.map(d => [String(d.code_dep).padStart(2, '0'), d]));

    const combinedData = dataProd.map(d => {
        const code = String(d.code_dept).padStart(2, '0');
        
        const sunData = dataSoleil.find(s => String(s.code_dept).padStart(2, '0') === code);
        const topoData = topoMap.get(code); 
        
        const surface = d.surf_totale || 0;
        const production = d.total_prod || 0;
        
        // Calcul du Rendement (hl / ha)
        const rendement = surface > 20 ? (production / surface) : 0; 
        
        return {
            code: code,
            nom: d.nom_dept,
            surface: surface,
            production: production,
            rendement: rendement,
            
            soleil: sunData ? sunData.heures_soleil : 0,
            altitude: topoData ? topoData.altitude : 0,
            pente: topoData ? topoData.pente : 0,
            exposition: topoData ? topoData.exposition : 0,
            
            data_vin: d
        };
    }).filter(d => d.rendement > 0 && d[metric] > 0); 

    // Échelle de couleur pour le Rendement
    const colorScale = d3.scaleSequential()
        .domain([0, 100])
        .interpolator(d3.interpolateYlGnBu);

    // Container
    const container = document.createElement("div");
    container.style.fontFamily = "sans-serif";
    
    const title = document.createElement("h3");
    title.textContent = `Impact de ${metric === 'pente' ? 'la Pente' : metric === 'altitude' ? "l'Altitude" : metric === 'soleil' ? "l'Ensoleillement" : "l'Exposition"} sur le Rendement`;
    title.style.color = "#800020";
    title.style.borderBottom = "2px solid #ddd";
    title.style.paddingBottom = "10px";
    container.appendChild(title);

    // Carte
    const svgMap = d3.create("svg")
        .attr("width", width)
        .attr("height", heightMap)
        .attr("viewBox", [0, 0, width, heightMap]);

    const projection = d3.geoConicConformal()
        .center([2.454071, 46.279229])
        .scale(2800)
        .translate([width / 2, heightMap / 2]);
    const path = d3.geoPath().projection(projection);

    const geojson = JSON.parse(JSON.stringify(departments));

    for (const feature of geojson.features) {
        const depCode = feature.properties.code;
        const row = combinedData.find(c => c.code === depCode);
        feature.properties.value = row ? row.rendement : 0;
        feature.properties.info = row;
    }

    const gMap = svgMap.append("g");
    const paths = gMap.selectAll("path")
        .data(geojson.features)
        .join("path")
        .attr("d", path)
        .attr("fill", d => d.properties.value > 0 ? colorScale(d.properties.value) : "#eee")
        .attr("stroke", "white")
        .attr("stroke-width", 0.5)
        .attr("cursor", "pointer");

    paths.filter(d => d.properties.code === codeSelection)
        .attr("stroke", "#000").attr("stroke-width", 2.5).raise();

    paths.on("click", (e, d) => { 
            departementSelectionne = d.properties;
            renderProductionDashboard();
            renderSunshineDashboard();
            renderTopographyDashboard();
            renderImpactDashboard();
        })
        .on("mouseover", function(event, d) { 
            d3.select(this).attr("stroke", "#333").attr("stroke-width", 2.5).raise();
            const info = d.properties.info;
            if (info) {
                tooltip.style("visibility", "visible")
                    .html(`<strong>${d.properties.nom}</strong><br/>Rendement: <strong>${Math.round(d.properties.value)} hl/ha</strong><br/>${labels[metric]}: <strong>${Math.round(info[metric])}</strong>`);
            }
        })
        .on("mousemove", function(event) {
            tooltip.style("top", (event.pageY - 10) + "px")
                .style("left", (event.pageX + 10) + "px");
        })
        .on("mouseout", function(e, d) {
            const isSel = d.properties.code === codeSelection;
            d3.select(this).attr("stroke", isSel ? "#000" : "white").attr("stroke-width", isSel ? 2.5 : 0.5);
            if (!isSel && codeSelection) paths.filter(p => p.properties.code === codeSelection).raise();
            tooltip.style("visibility", "hidden");
        });

    svgMap.append("text")
        .attr("x", 20)
        .attr("y", 30)
        .text("Carte : Rendement Viticole (hl/ha)")
        .style("font-weight", "bold");

    container.appendChild(svgMap.node());

    // Graphique
    const plotContainer = document.createElement("div");
    plotContainer.style.marginTop = "20px";
    
    const labels = {
        soleil: "Ensoleillement (h/an)",
        altitude: "Altitude Moyenne (m)",
        pente: "Pente Moyenne (%)",
        exposition: "Exposition Moyenne (°)"
    };

    const scatterplot = Plot.plot({
        width: width,
        height: heightPlot,
        marginLeft: 50,
        grid: true,
        style: { background: "#fafafa", padding: "10px", borderRadius: "8px" },
        x: { label: labels[metric] + " →", percent: false },
        y: { label: "↑ Rendement (hl/ha)", domain: [0, 150] },
        marks: [
            Plot.linearRegressionY(combinedData, {
                x: metric, 
                y: "rendement", 
                stroke: "#d32f2f", 
                strokeWidth: 2, 
                opacity: 0.6
            }),
            
            Plot.dot(combinedData, {
                x: metric, 
                y: "rendement", 
                fill: d => colorScale(d.rendement),
                stroke: "#333",
                strokeWidth: d => d.code === codeSelection ? 3 : 1,
                r: d => (Math.sqrt(d.surface) / 2), 
                title: d => `${d.nom}\n${labels[metric]}: ${Math.round(d[metric])}\nRendement: ${Math.round(d.rendement)} hl/ha\nSurface: ${Math.round(d.surface)} ha`
            }),
            
            Plot.text(combinedData, {
                x: metric, 
                y: "rendement", 
                text: "code", 
                dy: -10, 
                fill: d => d.code === codeSelection ? "black" : "#555",
                fontWeight: d => d.code === codeSelection ? "bold" : "normal",
                filter: d => d.surface > 3000 || d.code === codeSelection
            })
        ],
        caption: `Chaque point est un département. La taille du point représente la surface viticole. La ligne rouge montre la tendance générale entre ${labels[metric].toLowerCase()} et rendement.`
    });

    plotContainer.appendChild(scatterplot);
    container.appendChild(plotContainer);
    
    // Add color legend for the map
    const mapLegendContainer = document.createElement("div");
    mapLegendContainer.style.marginTop = "15px";
    mapLegendContainer.style.marginBottom = "10px";
    const mapLegend = createColorLegend(colorScale, [0, 100], " hl/ha", 400);
    container.insertBefore(mapLegend, plotContainer);
    
    // Add data source
    const source = document.createElement("div");
    source.className = "data-source";
    source.textContent = "Source : Combinaison des données de production viticole (FranceAgriMer), ensoleillement (Météo-France) et topographie (IGN)";

    // Update container
    const dashboardContainer = document.getElementById('impact-dashboard');
    dashboardContainer.innerHTML = '';
    dashboardContainer.appendChild(container);
    dashboardContainer.appendChild(source);
}

// Event listeners
document.getElementById('wineType').addEventListener('change', (e) => {
    choixVin = e.target.value;
    renderProductionDashboard();
});

document.getElementById('topoMetric').addEventListener('change', (e) => {
    metricTopo = e.target.value;
    renderTopographyDashboard();
});

document.getElementById('impactFactor').addEventListener('change', (e) => {
    facteurX = e.target.value;
    renderImpactDashboard();
});

// Load data on page load
loadData();