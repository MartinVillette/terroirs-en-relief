// Global variables
let dataProd = null;
let dataSoleil = null;
let dataTopo = null;
let departments = null;
let departementSelectionne = null;
let choixVin = 'total_prod';
let metricTopo = 'altitude';
let facteurX = 'soleil';

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
        .on("mouseover", function() {
            d3.select(this).attr("stroke", "#333").attr("stroke-width", 2).raise();
        })
        .on("mouseout", function(e, d) {
            const isSel = d.properties.code === codeSelection;
            d3.select(this).attr("stroke", isSel ? "#000" : "white")
                .attr("stroke-width", isSel ? 2.5 : 0.5);
            if (!isSel && codeSelection) {
                paths.filter(p => p.properties.code === codeSelection).raise();
            }
        })
        .append("title")
        .text(d => `${d.properties.nom}\n${titleLabel} : ${Math.round(d.properties.value).toLocaleString()} hl`);

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

    const right = document.createElement("div");
    right.appendChild(chart);

    div.appendChild(left);
    div.appendChild(right);

    // Update container
    const dashboardContainer = document.getElementById('production-dashboard');
    dashboardContainer.innerHTML = '';
    dashboardContainer.appendChild(div);
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
        .on("mouseover", function() {
            d3.select(this).attr("stroke", "#333").attr("stroke-width", 2).raise();
        })
        .on("mouseout", function(e, d) {
            const isSel = d.properties.code === codeSelection;
            d3.select(this).attr("stroke", isSel ? "#000" : "white")
                .attr("stroke-width", isSel ? 2.5 : 0.5);
            if (!isSel && codeSelection) {
                paths.filter(p => p.properties.code === codeSelection).raise();
            }
        })
        .append("title")
        .text(d => `${d.properties.nom}\nEnsoleillement : ${Math.round(d.properties.value).toLocaleString()} h/an`);

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

    const right = document.createElement("div");
    right.appendChild(chart);

    div.appendChild(left);
    div.appendChild(right);

    // Update container
    const dashboardContainer = document.getElementById('sunshine-dashboard');
    dashboardContainer.innerHTML = '';
    dashboardContainer.appendChild(div);
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

    if (metric === "exposition") {
        // Draw departments as neutral grey fill
        const paths = g.selectAll("path")
            .data(geojson.features)
            .join("path")
            .attr("d", path)
            .attr("fill", d => d.properties.value > 0 ? "#e8e0d0" : "#eee")
            .attr("stroke", d => d.properties.code === codeSelection ? "#000" : "white")
            .attr("stroke-width", d => d.properties.code === codeSelection ? 2.5 : 0.5)
            .attr("cursor", "pointer")
            .on("click", (event, d) => {
                departementSelectionne = d.properties;
                renderProductionDashboard();
                renderSunshineDashboard();
                renderTopographyDashboard();
            })
            .on("mouseover", function(e, d) {
                if (d.properties.code === codeSelection) return;
                d3.select(this)
                    .attr("stroke", "#333")
                    .attr("stroke-width", 1.5);
            })
            .on("mouseout", function(e, d) {
                if (d.properties.code === codeSelection) return;
                d3.select(this)
                    .attr("stroke", "white")
                    .attr("stroke-width", 0.5);
            })
        paths.filter(d => d.properties.code === codeSelection).raise();


        // Draw arrows on each department centroid
        geojson.features.forEach(feature => {
            if (!feature.properties.value) return;

            const centroid = path.centroid(feature);
            if (isNaN(centroid[0]) || isNaN(centroid[1])) return;

            const angleDeg = feature.properties.value;
            // Convert exposition angle to SVG rotation
            // 0° = North = up, clockwise
            const angleRad = (angleDeg - 90) * Math.PI / 180;

            const isSelected = feature.properties.code === codeSelection;
            const arrowLen = isSelected ? 14 : 10;
            const color = isSelected ? "#d32f2f" : "#555";
            const strokeW = isSelected ? 2.5 : 1.5;

            const arrowGroup = g.append("g")
                .attr("class", "arrow-group")
                .attr("transform", `translate(${centroid[0]}, ${centroid[1]})`)
                .attr("cursor", "pointer")
                .on("click", (event) => {
                    departementSelectionne = feature.properties;
                    renderProductionDashboard();
                    renderSunshineDashboard();
                    renderTopographyDashboard();
                });


            // Arrow shaft
            const dx = Math.cos(angleRad) * arrowLen;
            const dy = Math.sin(angleRad) * arrowLen;

            arrowGroup.append("line")
                .attr("x1", -dx * 0.4)
                .attr("y1", -dy * 0.4)
                .attr("x2", dx * 0.8)
                .attr("y2", dy * 0.8)
                .attr("stroke", color)
                .attr("stroke-width", strokeW)
                .attr("stroke-linecap", "round");

            // Arrowhead
            const headLen = arrowLen * 0.45;
            const headAngle = 0.45;
            const tipX = dx * 0.8;
            const tipY = dy * 0.8;

            const leftX = tipX - headLen * Math.cos(angleRad - headAngle);
            const leftY = tipY - headLen * Math.sin(angleRad - headAngle);
            const rightX = tipX - headLen * Math.cos(angleRad + headAngle);
            const rightY = tipY - headLen * Math.sin(angleRad + headAngle);

            arrowGroup.append("polygon")
                .attr("points", `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`)
                .attr("fill", color);

            // Tooltip
            arrowGroup.append("title")
                .text(`${feature.properties.nom}\nExposition : ${Math.round(angleDeg)}° (${expositionToCardinal(angleDeg)})`);
        });
    }
    else {    
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
            .on("mouseover", function() {
                d3.select(this).attr("stroke", "#333").attr("stroke-width", 2).raise();
            })
            .on("mouseout", function(e, d) {
                const isSel = d.properties.code === codeSelection;
                d3.select(this).attr("stroke", isSel ? "#000" : "white")
                    .attr("stroke-width", isSel ? 2.5 : 0.5);
                if (!isSel && codeSelection) {
                    paths.filter(p => p.properties.code === codeSelection).raise();
                }
            })
            .append("title")
            .text(d => {
                const val = d.properties.value ? Math.round(d.properties.value * 10) / 10 : "N/A";
                return `${d.properties.nom}\n${metric.charAt(0).toUpperCase() + metric.slice(1)} : ${val} ${unit}`;
            });
    }

    // Create bar chart for topography
    const topData = enrichedDataTopo
        .filter(d => d[metric] > 0)
        .sort((a, b) => d3.descending(a[metric], b[metric]))
        .slice(0, 15);

    let chart;
    if (metric === "exposition") {
        chart = renderExpositionRoseChart(enrichedDataTopo, codeSelection, widthChart, heightChart);
    } else {
        chart = Plot.plot({
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
    }

    // Assemble the dashboard
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.alignItems = "flex-start";
    div.style.gap = "20px";

    const left = document.createElement("div");
    left.appendChild(svgMap.node());

    const right = document.createElement("div");
    right.appendChild(chart);

    div.appendChild(left);
    div.appendChild(right);

    // Update container
    const dashboardContainer = document.getElementById('topography-dashboard');
    dashboardContainer.innerHTML = '';
    dashboardContainer.appendChild(div);
}

// Helper: convert degrees to cardinal direction
function expositionToCardinal(deg) {
    const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
    const index = Math.round(deg / 22.5) % 16;
    return dirs[index];
}

function renderExpositionRoseChart(data, codeSelection, width, height) {
    const size = Math.min(width, height);
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 40;

    // Bin data into 10° ranges
    const numBins = 36; // 360 / 10
    const bins = Array.from({ length: numBins }, (_, i) => ({
        angle: i * 10,           // start angle in degrees
        angleMid: i * 10 + 5,    // midpoint of bin
        count: 0,
        departments: []
    }));

    data.forEach(d => {
        if (d.exposition > 0) {
            const binIndex = Math.floor(d.exposition / 10) % numBins;
            bins[binIndex].count++;
            bins[binIndex].departments.push(d);
        }
    });

    const maxCount = d3.max(bins, d => d.count) || 1;

    // SVG
    const svg = d3.create("svg")
        .attr("width", size)
        .attr("height", size + 40) // extra space for title
        .attr("viewBox", [0, 0, size, size + 40]);

    // Title
    svg.append("text")
        .attr("x", cx)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .attr("font-size", 14)
        .attr("font-weight", "bold")
        .attr("fill", "#333")
        .text("Exposition des vignes (par tranche de 10°)");

    const g = svg.append("g")
        .attr("transform", `translate(${cx}, ${cy + 40})`);

    // Background circles
    const gridLevels = 4;
    for (let i = 1; i <= gridLevels; i++) {
        const r = (radius * i) / gridLevels;
        g.append("circle")
            .attr("r", r)
            .attr("fill", "none")
            .attr("stroke", "#ddd")
            .attr("stroke-dasharray", "3,3");

        // Count label on the grid
        g.append("text")
            .attr("x", 4)
            .attr("y", -r + 4)
            .attr("font-size", 10)
            .attr("fill", "#aaa")
            .text(Math.round((maxCount * i) / gridLevels));
    }

    // Cardinal direction lines
    const directions = [
        { angle: 0,   label: "N"  },
        { angle: 45,  label: "NE" },
        { angle: 90,  label: "E"  },
        { angle: 135, label: "SE" },
        { angle: 180, label: "S"  },
        { angle: 225, label: "SO" },
        { angle: 270, label: "O"  },
        { angle: 315, label: "NO" }
    ];

    directions.forEach(({ angle, label }) => {
        const rad = (angle - 90) * Math.PI / 180;
        const x2 = Math.cos(rad) * radius;
        const y2 = Math.sin(rad) * radius;
        const lx = Math.cos(rad) * (radius + 20);
        const ly = Math.sin(rad) * (radius + 20);

        g.append("line")
            .attr("x1", 0).attr("y1", 0)
            .attr("x2", x2).attr("y2", y2)
            .attr("stroke", "#ccc")
            .attr("stroke-width", 0.5);

        g.append("text")
            .attr("x", lx)
            .attr("y", ly)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("font-size", 11)
            .attr("font-weight", "bold")
            .attr("fill", "#555")
            .text(label);
    });

    // Draw petals
    const angleStep = (2 * Math.PI) / numBins;

    bins.forEach((bin, i) => {
        if (bin.count === 0) return;

        const r = (bin.count / maxCount) * radius;
        // Offset by -90° so that 0° = North = top
        const startAngle = (i * 10 - 90) * Math.PI / 180;
        const endAngle = ((i + 1) * 10 - 90) * Math.PI / 180;

        const x1 = Math.cos(startAngle) * r;
        const y1 = Math.sin(startAngle) * r;
        const x2 = Math.cos(endAngle) * r;
        const y2 = Math.sin(endAngle) * r;

        // Check if selected department is in this bin
        const hasSelected = codeSelection && 
            bin.departments.some(d => String(d.code_dep).padStart(2, '0') === codeSelection);

        const petal = g.append("path")
            .attr("d", `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`)
            .attr("fill", hasSelected ? "#d32f2f" : "#f57c00")
            .attr("fill-opacity", 0.75)
            .attr("stroke", "white")
            .attr("stroke-width", 0.5)
            .attr("cursor", "pointer");

        // Tooltip
        const deptNames = bin.departments.map(d => d.nom_dept).join(", ");
        petal.append("title")
            .text(`${bin.angle}° - ${bin.angle + 10}°\n${bin.count} département(s)\n${deptNames}`);

        // Hover interaction
        petal
            .on("mouseover", function() {
                d3.select(this)
                    .attr("fill-opacity", 1)
                    .attr("stroke", "#333")
                    .attr("stroke-width", 1.5);
            })
            .on("mouseout", function() {
                d3.select(this)
                    .attr("fill-opacity", 0.75)
                    .attr("stroke", "white")
                    .attr("stroke-width", 0.5);
            });
    });

    // Center dot
    g.append("circle")
        .attr("r", 3)
        .attr("fill", "#333");

    return svg.node();
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

    const width = 1000;
    const heightMap = 600;
    const heightPlot = 350;

    // Préparation des données
    const topoMap = new Map(dataTopo.map(d => [String(d.code_dep).padStart(2, '0'), d]));

    const combinedData = dataProd.map(d => {
        const code = String(d.code_dept).padStart(2, '0');
        
        const sunData = dataSoleil.find(s => String(s.code_dept).padStart(2, '0') === code);
        const topoData = topoMap.get(code); 
        
        const surface = d.surf_totale || 0;
        const production = d.total_prod || 0;
        
        // Calcul du Rendement (hl / ha)
        const rendement = surface > 0.1 ? (production / surface) : 0; 
        
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
        .on("mouseover", function() { 
            d3.select(this).attr("stroke", "#333").attr("stroke-width", 2.5).raise(); 
        })
        .on("mouseout", function(e, d) {
            const isSel = d.properties.code === codeSelection;
            d3.select(this).attr("stroke", isSel ? "#000" : "white").attr("stroke-width", isSel ? 2.5 : 0.5);
            if (!isSel && codeSelection) paths.filter(p => p.properties.code === codeSelection).raise();
        })
        .append("title")
        .text(d => d.properties.info 
            ? `${d.properties.nom}\nRendement: ${Math.round(d.properties.value)} hl/ha\n${metric}: ${Math.round(d.properties.info[metric])}`
            : d.properties.nom);

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

    // Update container
    const dashboardContainer = document.getElementById('impact-dashboard');
    dashboardContainer.innerHTML = '';
    dashboardContainer.appendChild(container);
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