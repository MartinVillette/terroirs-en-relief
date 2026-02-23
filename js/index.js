// Global variables
let dataProd = null;
let dataSoleil = null;
let dataTopo = null;
let departments = null;
let departementSelectionne = null;
let choixVin = 'total_aop';
let metricTopo = 'altitude';
let facteurX = 'soleil';
const renderedTabs = new Set();

function setDepartement(code) {
    const normalized = code ? String(code).padStart(2, '0') : null;
    departementSelectionne = (departementSelectionne === normalized) ? null : normalized;
    rerenderAllRenderedTabs();
}

function rerenderAllRenderedTabs() {
    renderedTabs.forEach(tabId => renderTab(tabId));
}

// Mapping des principales AOP par département
const aopParDepartement = {
    "33": ["Bordeaux", "Bordeaux Supérieur", "Médoc", "Haut-Médoc", "Margaux", "Pauillac", "Saint-Estèphe", "Saint-Julien", "Pessac-Léognan", "Graves", "Sauternes", "Pomerol", "Saint-Émilion"],
    "34": ["Languedoc", "Faugères", "Saint-Chinian", "Picpoul de Pinet"],
    "11": ["Corbières", "Fitou", "Minervois", "Limoux"],
    "51": ["Champagne"],
    "10": ["Champagne"],
    "02": ["Champagne"],
    "21": ["Bourgogne", "Côte de Nuits", "Côte de Beaune", "Gevrey-Chambertin", "Pommard", "Meursault"],
    "71": ["Mâcon", "Pouilly-Fuissé", "Saint-Véran"],
    "69": ["Beaujolais", "Brouilly", "Morgon", "Fleurie", "Moulin-à-Vent"],
    "13": ["Côtes de Provence", "Coteaux d'Aix-en-Provence", "Bandol", "Cassis"],
    "83": ["Côtes de Provence", "Bandol"],
    "84": ["Côtes du Rhône", "Châteauneuf-du-Pape", "Gigondas", "Vacqueyras"],
    "30": ["Côtes du Rhône", "Costières de Nîmes"],
    "26": ["Côtes du Rhône", "Crozes-Hermitage", "Hermitage", "Saint-Joseph"],
    "07": ["Côtes du Rhône", "Saint-Joseph", "Cornas"],
    "67": ["Alsace", "Alsace Grand Cru", "Crémant d'Alsace"],
    "68": ["Alsace", "Alsace Grand Cru", "Crémant d'Alsace"],
    "37": ["Vouvray", "Montlouis", "Chinon", "Bourgueil"],
    "49": ["Anjou", "Saumur", "Saumur-Champigny", "Coteaux du Layon"],
    "44": ["Muscadet", "Muscadet-Sèvre-et-Maine"],
    "85": ["Fiefs Vendéens"],
    "17": ["Cognac", "Pineau des Charentes"],
    "16": ["Cognac", "Pineau des Charentes"],
    "24": ["Bergerac", "Monbazillac", "Pécharmant"],
    "47": ["Côtes du Marmandais", "Buzet"],
    "32": ["Côtes de Gascogne", "Saint-Mont"],
    "64": ["Jurançon", "Madiran", "Irouléguy"],
    "66": ["Côtes du Roussillon", "Collioure", "Banyuls"],
    "2A": ["Ajaccio"],
    "2B": ["Patrimonio"],
    "39": ["Côtes du Jura", "Arbois", "L'Étoile"],
    "89": ["Chablis"],
    "18": ["Sancerre", "Menetou-Salon", "Quincy"]
};

const tooltip = d3.select("body").append("div")
    .attr("id", "map-tooltip")
    .style("position", "fixed")
    .style("background", "rgba(255,255,255,0.97)")
    .style("border", "1px solid #ddd")
    .style("border-radius", "6px")
    .style("padding", "10px 14px")
    .style("font-size", "13px")
    .style("font-family", "sans-serif")
    .style("color", "#333")
    .style("box-shadow", "0 2px 8px rgba(0,0,0,0.15)")
    .style("pointer-events", "none")
    .style("display", "none")
    .style("z-index", "9999")
    .style("max-width", "220px")
    .style("line-height", "1.6");

function showTooltip(event, html) {
    tooltip
        .style("display", "block")
        .html(html);
    moveTooltip(event);
}

function moveTooltip(event) {
    const tw = tooltip.node().offsetWidth;
    const th = tooltip.node().offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = event.clientX + 14;
    let y = event.clientY + 14;

    // Flip left if overflowing right
    if (x + tw > vw - 10) x = event.clientX - tw - 14;
    // Flip up if overflowing bottom
    if (y + th > vh - 10) y = event.clientY - th - 14;

    tooltip.style("left", x + "px").style("top", y + "px");
}

function hideTooltip() {
    tooltip.style("display", "none");
}

// Tab switching logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.dataset.tab;
        document.getElementById('tab-' + tabId).classList.add('active');

        // Render on first visit (lazy rendering)
        if (!renderedTabs.has(tabId)) {
            renderTab(tabId);
            renderedTabs.add(tabId);
        }
    });
});

function renderTab(tabId) {
    switch (tabId) {
        case 'production':    renderProductionDashboard(); break;
        case 'ensoleillement': renderSunshineDashboard(); break;
        case 'pente':         renderTopoDashboard('pente'); break;
        case 'orientation':   renderTopoDashboard('exposition'); break;
        case 'altitude':      renderTopoDashboard('altitude'); break;
        case 'impact':        renderImpactDashboard(); break;
    }
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

        // Render the first tab (production) on load
        renderProductionDashboard();
        renderedTabs.add('production');

    } catch (error) {
        document.getElementById('production-dashboard').innerHTML =
            `<div style="color: red; padding: 20px;">Erreur de chargement : ${error.message}</div>`;
    }
}

// ─── Helper: render a distribution histogram ─────────────────────────────────
function renderDistributionChart(data, metric, unit, color, width, height, title) {
    const values = data.map(d => d[metric]).filter(v => v > 0);
    const binGenerator = d3.bin().thresholds(12)(values);

    const binData = binGenerator.map(b => ({
        x0: b.x0,
        x1: b.x1,
        count: b.length,
        label: `${Math.round(b.x0)} – ${Math.round(b.x1)} ${unit}`
    }));

    return Plot.plot({
        title,
        width,
        height,
        marginLeft: 50,
        marginBottom: 40,
        x: { label: unit, tickFormat: "s" },
        y: { label: "Nb. départements", grid: true },
        marks: [
            Plot.rectY(binData, {
                x1: "x0",
                x2: "x1",
                y: "count",
                fill: color,
                fillOpacity: 0.8,
                title: d => `${d.label}\n${d.count} département(s)`
            }),
            Plot.ruleY([0])
        ]
    });
}


function appendMapLegend(containerDiv, colorScale, domain, label, format = d => Math.round(d)) {
    const legendWidth = 200;
    const legendHeight = 12;
    const margin = { left: 10, right: 10, top: 20, bottom: 20 };

    const totalWidth = legendWidth + margin.left + margin.right;
    const totalHeight = legendHeight + margin.top + margin.bottom;

    const svgLegend = d3.create("svg")
        .attr("width", totalWidth)
        .attr("height", totalHeight);

    const defs = svgLegend.append("defs");
    const gradientId = "legend-gradient-" + Math.random().toString(36).substr(2, 9);
    const gradient = defs.append("linearGradient")
        .attr("id", gradientId)
        .attr("x1", "0%").attr("x2", "100%");

    const steps = 10;
    d3.range(steps + 1).forEach(i => {
        const t = i / steps;
        gradient.append("stop")
            .attr("offset", `${t * 100}%`)
            .attr("stop-color", colorScale(domain[0] + t * (domain[1] - domain[0])));
    });

    const g = svgLegend.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Label above the bar
    g.append("text")
        .attr("x", legendWidth / 2)
        .attr("y", -6)
        .attr("font-size", 11)
        .attr("font-weight", "bold")
        .attr("fill", "#333")
        .attr("text-anchor", "middle")
        .text(label);

    // Gradient bar
    g.append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .attr("rx", 2)
        .style("fill", `url(#${gradientId})`);

    // Tick labels below the bar
    g.append("text")
        .attr("x", 0)
        .attr("y", legendHeight + 14)
        .attr("font-size", 10)
        .attr("fill", "#555")
        .attr("text-anchor", "start")
        .text(format(domain[0]));

    g.append("text")
        .attr("x", legendWidth / 2)
        .attr("y", legendHeight + 14)
        .attr("font-size", 10)
        .attr("fill", "#555")
        .attr("text-anchor", "middle")
        .text(format((domain[0] + domain[1]) / 2));

    g.append("text")
        .attr("x", legendWidth)
        .attr("y", legendHeight + 14)
        .attr("font-size", 10)
        .attr("fill", "#555")
        .attr("text-anchor", "end")
        .text(format(domain[1]));

    containerDiv.appendChild(svgLegend.node());
}

function appendMapSource(containerDiv, source, url = null) {
    const sourceDiv = document.createElement("div");
    sourceDiv.style.cssText = "font-size:11px; color:#999; margin-top:4px; font-style:italic;";

    if (url) {
        sourceDiv.innerHTML = `Source : <a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#999; text-decoration:underline; cursor:pointer;">${source}</a>`;
    } else {
        sourceDiv.textContent = `Source : ${source}`;
    }

    containerDiv.appendChild(sourceDiv);
}


// ─── Production Dashboard ─────────────────────────────────────────────────────
function renderProductionDashboard() {
    if (!dataProd || !departments) return;

    const widthMap = 500;
    const heightMap = 500;
    const widthChart = 420;
    const heightChart = 460;

    const metric = choixVin;
    const codeSelection = departementSelectionne;

    const themes = {
        total_aop: { scale: d3.interpolatePuRd, color: "#8e24aa", label: "Production Totale AOP" },
        aop_rouge: { scale: d3.interpolateReds,  color: "#d32f2f", label: "Vin Rouge AOP" },
        aop_blanc: { scale: d3.interpolateYlGn,  color: "#9ccc65", label: "Vin Blanc AOP" },
        aop_rose:  { scale: d3.interpolateRdPu,  color: "#f06292", label: "Vin Rosé AOP" }
    };

    const theme = themes[metric];
    const mapInterpolator = theme.scale;
    const barColorBase = theme.color;
    const titleLabel = theme.label;

    const maxVal = d3.max(dataProd, d => d[metric]) || 10000;
    const colorScaleMap = d3.scaleSequential([0, maxVal], mapInterpolator);
    const totalWidth = widthMap + widthChart + 20; // 20 = gap

    // ── Map ──
    const svgMap = d3.create("svg").attr("width", widthMap).attr("height", heightMap).attr("viewBox", [0, 0, widthMap, heightMap]);
    const projection = d3.geoConicConformal().center([2.454071, 46.279229]).scale(2600).translate([widthMap / 2, heightMap / 2]);
    const path = d3.geoPath().projection(projection);

    const geojson = JSON.parse(JSON.stringify(departments));
    for (const feature of geojson.features) {
        const depCode = feature.properties.code;
        const row = dataProd.find(d => String(d.code_dept).padStart(2, '0') === depCode);
        feature.properties.value = row ? row[metric] : 0;
    }

    const g = svgMap.append("g");
    const paths = g.selectAll("path").data(geojson.features).join("path")
        .attr("d", path)
        .attr("fill", d => d.properties.value > 0 ? colorScaleMap(d.properties.value) : "#eee")
        .attr("stroke", "white").attr("stroke-width", 0.5).attr("cursor", "pointer");

    paths.filter(d => d.properties.code === codeSelection).attr("stroke", "#000").attr("stroke-width", 2.5).raise();

    paths.on("click", (e, d) => { setDepartement(d.properties.code); })
        .on("mouseover", function(e, d) {
            d3.select(this).attr("stroke", "#333").attr("stroke-width", 2).raise();
            showTooltip(e, `<strong>${d.properties.nom}</strong><br>${titleLabel} : <strong>${Math.round(d.properties.value).toLocaleString()} hl</strong>`);
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", function(e, d) {
            const isSel = d.properties.code === codeSelection;
            d3.select(this).attr("stroke", isSel ? "#000" : "white").attr("stroke-width", isSel ? 2.5 : 0.5);
            if (!isSel && codeSelection) paths.filter(p => p.properties.code === codeSelection).raise();
            hideTooltip();
        });

    // ── Top 15 bar chart ──
    const topData = [...dataProd].sort((a, b) => d3.descending(a[metric], b[metric])).slice(0, 15);
    const barChart = Plot.plot({
        title: `Top 15 : ${titleLabel} (hl)`,
        marginLeft: 120, width: widthChart, height: heightChart,
        x: { label: null, grid: true, tickFormat: "s" },
        y: { label: null },
        marks: [
            Plot.barX(topData, {
                x: metric, y: "nom_dept",
                fill: d => String(d.code_dept).padStart(2, '0') === codeSelection ? "#222" : barColorBase,
                sort: { y: "x", reverse: true }
            }),
            Plot.text(topData, {
                x: metric, y: "nom_dept",
                text: d => (d[metric] / 1000).toFixed(0) + "k",
                textAnchor: "start", dx: 5, fill: "#444", fontSize: 10
            })
        ]
    });

    // ── Distribution histogram (full width) ──
    const histChart = renderDistributionChart(
        dataProd, metric, "hl", barColorBase, totalWidth, 220,
        `Répartition des départements par volume (${titleLabel})`
    );

    // ── Info bubble ──
    const infoTexts = {
        total_aop: `L'<strong>Hérault</strong> cumule une grande production de rouge, blanc et rosé pour atteindre la première place, tandis que la <strong>Gironde</strong> s'impose à la seconde place avec une production quasi-exclusive de vin rouge.`,
        aop_rouge: `La <strong>Gironde</strong> est la région du Bordeaux, produisant les plus grands vins rouges français (Pauillac, Margaux, Saint-Émilion, Pomerol).`,
        aop_blanc: `La <strong>Marne</strong> (Champagne) et l'<strong>Hérault</strong> (Languedoc) dominent la production de vins blancs AOP.`,
        aop_rose:  `Les <strong>Bouches-du-Rhône</strong> et le <strong>Var</strong> dominent la production de rosé, au cœur du bassin méditerranéen.`
    };
    const infoBubble = document.createElement("div");
    infoBubble.style.cssText = `background:${barColorBase}15; border:2px solid ${barColorBase}; border-radius:8px; padding:12px 16px; font-size:13px; line-height:1.5; color:#333; width:${totalWidth}px; box-sizing:border-box;`;
    infoBubble.innerHTML = `<strong style="color:${barColorBase};">💡 ${titleLabel}</strong><br/>${infoTexts[metric]}`;

    // ── Layout ──
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex; flex-direction:column; gap:16px;";

    // Top row: map + bar chart side by side
    const topRow = document.createElement("div");
    topRow.style.cssText = "display:flex; align-items:flex-start; gap:20px;";

    const leftCol = document.createElement("div");
    leftCol.style.cssText = "display:flex; flex-direction:column;";
    leftCol.appendChild(svgMap.node());
    appendMapLegend(leftCol, colorScaleMap, [0, maxVal], titleLabel + " (hl)", d => (d / 1000).toFixed(0) + "k");

    const rightCol = document.createElement("div");
    rightCol.appendChild(barChart);

    topRow.appendChild(leftCol);
    topRow.appendChild(rightCol);

    // Bottom row: histogram full width
    const bottomRow = document.createElement("div");
    bottomRow.style.cssText = "display:flex; flex-direction:column; gap:10px;";
    bottomRow.appendChild(histChart);
    bottomRow.appendChild(infoBubble);

    appendMapSource(bottomRow, "Douane.gouv", "https://www.douane.gouv.fr/la-douane/opendata/mots-cles/recolte");

    wrapper.appendChild(topRow);
    wrapper.appendChild(bottomRow);

    const dashboardContainer = document.getElementById('production-dashboard');
    dashboardContainer.innerHTML = '';
    dashboardContainer.appendChild(wrapper);
}

// ─── Sunshine Dashboard ───────────────────────────────────────────────────────
function renderSunshineDashboard() {
    if (!dataSoleil || !departments) return;

    const widthMap = 500, heightMap = 500, widthChart = 420, heightChart = 460;
    const totalWidth = widthMap + widthChart + 20;
    const codeSelection = departementSelectionne;

    const maxVal = d3.max(dataSoleil, d => d.heures_soleil) || 3000;
    const colorScaleMap = d3.scaleSequential([0, maxVal], d3.interpolateYlOrRd);

    const svgMap = d3.create("svg").attr("width", widthMap).attr("height", heightMap).attr("viewBox", [0, 0, widthMap, heightMap]);
    const projection = d3.geoConicConformal().center([2.454071, 46.279229]).scale(2600).translate([widthMap / 2, heightMap / 2]);
    const path = d3.geoPath().projection(projection);

    const geojson = JSON.parse(JSON.stringify(departments));
    for (const feature of geojson.features) {
        const depCode = feature.properties.code;
        const row = dataSoleil.find(d => String(d.code_dept).padStart(2, '0') === depCode);
        feature.properties.value = row ? row.heures_soleil : 0;
    }

    const g = svgMap.append("g");
    const paths = g.selectAll("path").data(geojson.features).join("path")
        .attr("d", path)
        .attr("fill", d => d.properties.value > 0 ? colorScaleMap(d.properties.value) : "#eee")
        .attr("stroke", "white").attr("stroke-width", 0.5).attr("cursor", "pointer");

    paths.filter(d => d.properties.code === codeSelection).attr("stroke", "#000").attr("stroke-width", 2.5).raise();

    paths.on("click", (e, d) => { setDepartement(d.properties.code); })
        .on("mouseover", function(e, d) {
            d3.select(this).attr("stroke", "#333").attr("stroke-width", 2).raise();
            showTooltip(e, `<strong>${d.properties.nom}</strong><br>Ensoleillement : <strong>${Math.round(d.properties.value).toLocaleString()} h/an</strong>`);
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", function(e, d) {
            const isSel = d.properties.code === codeSelection;
            d3.select(this).attr("stroke", isSel ? "#000" : "white").attr("stroke-width", isSel ? 2.5 : 0.5);
            if (!isSel && codeSelection) paths.filter(p => p.properties.code === codeSelection).raise();
            hideTooltip();
        });

    const barChart = Plot.plot({
        title: "Top 15 : Ensoleillement (h/an)",
        marginLeft: 140, width: widthChart, height: heightChart,
        x: { label: "h/an", grid: true, tickFormat: "s" },
        y: { label: null },
        marks: [
            Plot.barX(dataSoleil, {
                x: "heures_soleil", y: "nom_dept",
                fill: d => String(d.code_dept).padStart(2, '0') === codeSelection ? "#d32f2f" : "#f39c12",
                sort: { y: "x", reverse: true, limit: 15 }
            }),
            Plot.text(dataSoleil, {
                x: "heures_soleil", y: "nom_dept",
                text: d => (d.heures_soleil / 1000).toFixed(1) + "k",
                textAnchor: "start", dx: 5, fill: "#666", fontSize: 10,
                sort: { y: "x", reverse: true, limit: 15 }
            })
        ]
    });

    const histChart = renderDistributionChart(
        dataSoleil, "heures_soleil", "h/an", "#f39c12", totalWidth, 220,
        "Répartition des départements par ensoleillement"
    );

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex; flex-direction:column; gap:16px;";

    const topRow = document.createElement("div");
    topRow.style.cssText = "display:flex; align-items:flex-start; gap:20px;";

    const leftCol = document.createElement("div");
    leftCol.style.cssText = "display:flex; flex-direction:column;";
    leftCol.appendChild(svgMap.node());
    appendMapLegend(leftCol, colorScaleMap, [0, maxVal], "Ensoleillement (h/an)", d => Math.round(d) + "h");

    const rightCol = document.createElement("div");
    rightCol.appendChild(barChart);

    topRow.appendChild(leftCol);
    topRow.appendChild(rightCol);

    const bottomRow = document.createElement("div");
    bottomRow.appendChild(histChart);
    appendMapSource(bottomRow, "linternaute.com", "https://www.petitlopin.fr/?map=ensoleillement");


    wrapper.appendChild(topRow);
    wrapper.appendChild(bottomRow);

    const dashboardContainer = document.getElementById('sunshine-dashboard');
    dashboardContainer.innerHTML = '';
    dashboardContainer.appendChild(wrapper);
}

// ─── Generic Topo Dashboard ───────────────────────────────────────────────────
function renderTopoDashboard(metric) {
    const containerIds = { pente: 'pente-dashboard', exposition: 'orientation-dashboard', altitude: 'altitude-dashboard' };
    const containerId = containerIds[metric];
    if (!dataTopo || !departments) return;

    const widthMap = 500, heightMap = 500, widthChart = 420, heightChart = 460;
    const totalWidth = widthMap + widthChart + 20;
    const codeSelection = departementSelectionne;

    const deptNamesMap = new Map();
    departments.features.forEach(f => deptNamesMap.set(f.properties.code, f.properties.nom));
    const enriched = dataTopo.map(d => ({
        ...d,
        nom_dept: deptNamesMap.get(String(d.code_dep).padStart(2, '0')) || `Dept ${d.code_dep}`
    }));

    const configs = {
        pente:      { interpolator: d3.interpolateReds,   domainMax: 15,   label: "Pente",      unit: "%",  color: "#d32f2f", title: "Top 15 : Pente moyenne (%)" },
        altitude:   { interpolator: d3.interpolateGnBu,   domainMax: null, label: "Altitude",   unit: "m",  color: "#1976d2", title: "Top 15 : Altitude moyenne (m)" },
        exposition: { interpolator: d3.interpolateYlOrBr, domainMax: 360,  label: "Exposition", unit: "°",  color: "#f57c00", title: "Exposition des vignes (rosace)" }
    };

    const cfg = configs[metric];
    const domainMax = cfg.domainMax || d3.max(enriched, d => d[metric]) || 100;
    const colorScale = d3.scaleSequential([0, domainMax], cfg.interpolator);

    // ── Map ──
    const svgMap = d3.create("svg").attr("width", widthMap).attr("height", heightMap).attr("viewBox", [0, 0, widthMap, heightMap]);
    const projection = d3.geoConicConformal().center([2.454071, 46.279229]).scale(2600).translate([widthMap / 2, heightMap / 2]);
    const path = d3.geoPath().projection(projection);

    const geojson = JSON.parse(JSON.stringify(departments));
    for (const feature of geojson.features) {
        const depCode = feature.properties.code;
        const row = enriched.find(d => String(d.code_dep).padStart(2, '0') === depCode);
        feature.properties.value = row ? row[metric] : 0;
    }

    const g = svgMap.append("g");

    if (metric === "exposition") {
        const paths = g.selectAll("path").data(geojson.features).join("path")
            .attr("d", path)
            .attr("fill", d => d.properties.value > 0 ? "#e8e0d0" : "#eee")
            .attr("stroke", d => d.properties.code === codeSelection ? "#000" : "white")
            .attr("stroke-width", d => d.properties.code === codeSelection ? 2.5 : 0.5)
            .attr("cursor", "pointer")
            .on("click", (e, d) => { setDepartement(d.properties.code); })
            .on("mouseover", function(e, d) {
                d3.select(this).attr("stroke", "#333").attr("stroke-width", 2).raise();
                g.selectAll(".arrow-group").raise();
                showTooltip(e, `<strong>${d.properties.nom}</strong><br>Exposition : <strong>${Math.round(d.properties.value)}° (${expositionToCardinal(d.properties.value)})</strong>`);
            })
            .on("mousemove", moveTooltip)
            .on("mouseout", function(e, d) {
                const isSel = d.properties.code === codeSelection;
                d3.select(this).attr("stroke", isSel ? "#000" : "white").attr("stroke-width", isSel ? 2.5 : 0.5);
                g.selectAll(".arrow-group").raise();
                hideTooltip();
            });

        geojson.features.forEach(feature => {
            if (!feature.properties.value) return;
            const centroid = path.centroid(feature);
            if (isNaN(centroid[0]) || isNaN(centroid[1])) return;
            const angleDeg = feature.properties.value;
            const angleRad = (angleDeg - 90) * Math.PI / 180;
            const isSelected = feature.properties.code === codeSelection;
            const arrowLen = isSelected ? 14 : 10;
            const color = isSelected ? "#d32f2f" : "#555";
            const strokeW = isSelected ? 2.5 : 1.5;
            const arrowGroup = g.append("g").attr("class", "arrow-group")
                .attr("transform", `translate(${centroid[0]}, ${centroid[1]})`).attr("cursor", "pointer")
                .on("click", () => { setDepartement(feature.properties.code); })
                .on("mouseover", e => showTooltip(e, `<strong>${feature.properties.nom}</strong><br>Exposition : <strong>${Math.round(angleDeg)}° (${expositionToCardinal(angleDeg)})</strong>`))
                .on("mousemove", moveTooltip).on("mouseout", hideTooltip);
            const dx = Math.cos(angleRad) * arrowLen, dy = Math.sin(angleRad) * arrowLen;
            arrowGroup.append("line").attr("x1", -dx * 0.4).attr("y1", -dy * 0.4).attr("x2", dx * 0.8).attr("y2", dy * 0.8)
                .attr("stroke", color).attr("stroke-width", strokeW).attr("stroke-linecap", "round");
            const headLen = arrowLen * 0.45, headAngle = 0.45;
            const tipX = dx * 0.8, tipY = dy * 0.8;
            const lx = tipX - headLen * Math.cos(angleRad - headAngle), ly = tipY - headLen * Math.sin(angleRad - headAngle);
            const rx = tipX - headLen * Math.cos(angleRad + headAngle), ry = tipY - headLen * Math.sin(angleRad + headAngle);
            arrowGroup.append("polygon").attr("points", `${tipX},${tipY} ${lx},${ly} ${rx},${ry}`).attr("fill", color);
        });
    } else {
        const paths = g.selectAll("path").data(geojson.features).join("path")
            .attr("d", path)
            .attr("fill", d => d.properties.value > 0 ? colorScale(d.properties.value) : "#eee")
            .attr("stroke", "white").attr("stroke-width", 0.5).attr("cursor", "pointer");
        paths.filter(d => d.properties.code === codeSelection).attr("stroke", "#000").attr("stroke-width", 2.5).raise();
        paths.on("click", (e, d) => { setDepartement(d.properties.code); })
            .on("mouseover", function(e, d) {
                d3.select(this).attr("stroke", "#333").attr("stroke-width", 2).raise();
                showTooltip(e, `<strong>${d.properties.nom}</strong><br>${cfg.label} : <strong>${d.properties.value.toFixed(1)} ${cfg.unit}</strong>`);
            })
            .on("mousemove", moveTooltip)
            .on("mouseout", function(e, d) {
                const isSel = d.properties.code === codeSelection;
                d3.select(this).attr("stroke", isSel ? "#000" : "white").attr("stroke-width", isSel ? 2.5 : 0.5);
                if (!isSel && codeSelection) paths.filter(p => p.properties.code === codeSelection).raise();
                hideTooltip();
            });
    }

    // ── Right chart: top15 or rose ──
    let mainChart;
    if (metric === "exposition") {
        mainChart = renderExpositionRoseChart(enriched, codeSelection, widthChart, heightChart);
    } else {
        const topData = [...enriched].filter(d => d[metric] > 0).sort((a, b) => d3.descending(a[metric], b[metric])).slice(0, 15);
        mainChart = Plot.plot({
            title: cfg.title, marginLeft: 140, width: widthChart, height: heightChart,
            x: { label: cfg.unit, grid: true },
            y: { label: null },
            marks: [
                Plot.barX(topData, {
                    x: metric, y: "nom_dept",
                    fill: d => String(d.code_dep).padStart(2, '0') === codeSelection ? "#222" : cfg.color,
                    sort: { y: "x", reverse: true }
                }),
                Plot.text(topData, {
                    x: metric, y: "nom_dept",
                    text: d => metric === "altitude" ? Math.round(d[metric]) + "m" : d[metric].toFixed(1) + cfg.unit,
                    textAnchor: "start", dx: 5, fill: "#666", fontSize: 10
                })
            ]
        });
    }

    // ── Bottom: histogram (full width) ──
    const histChart = metric !== "exposition"
        ? renderDistributionChart(enriched, metric, cfg.unit, cfg.color, totalWidth, 220,
            `Répartition des départements par ${cfg.label.toLowerCase()}`)
        : null;

    // ── Layout ──
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex; flex-direction:column; gap:16px;";

    const topRow = document.createElement("div");
    topRow.style.cssText = "display:flex; align-items:flex-start; gap:20px;";

    const leftCol = document.createElement("div");
    leftCol.style.cssText = "display:flex; flex-direction:column;";
    leftCol.appendChild(svgMap.node());

    if (metric !== "exposition") {
        appendMapLegend(leftCol, colorScale, [0, domainMax], `${cfg.label} (${cfg.unit})`,
            d => metric === "altitude" ? Math.round(d) + "m" : d.toFixed(1) + cfg.unit);
    } else {
        const compassDiv = document.createElement("div");
        compassDiv.style.cssText = "font-size:11px; color:#555; margin-top:6px;";
        compassDiv.innerHTML = `<strong>Légende :</strong> chaque flèche indique l'exposition solaire moyenne des vignes du département`;
        leftCol.appendChild(compassDiv);
    }

    const rightCol = document.createElement("div");
    rightCol.appendChild(mainChart);

    topRow.appendChild(leftCol);
    topRow.appendChild(rightCol);

    wrapper.appendChild(topRow);

    if (histChart) {
        const bottomRow = document.createElement("div");
        bottomRow.appendChild(histChart);
        appendMapSource(bottomRow, "INRAE", "https://entrepot.recherche.data.gouv.fr/dataset.xhtml?persistentId=doi:10.57745/KBTLDH");
        wrapper.appendChild(bottomRow);
    } else {
        appendMapSource(leftCol, "INRAE", "https://entrepot.recherche.data.gouv.fr/dataset.xhtml?persistentId=doi:10.57745/KBTLDH");
    }

    const dashboardContainer = document.getElementById(containerId);
    dashboardContainer.innerHTML = '';
    dashboardContainer.appendChild(wrapper);
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

    const codeSelection = departementSelectionne;
    const metric = facteurX;

    const width = 1000;
    const widthMap = 460;
    const heightMap = 500; 
    const heightPlot = 350;

    // Préparation des données
    const topoMap = new Map(dataTopo.map(d => [String(d.code_dep).padStart(2, '0'), d]));

    const combinedData = dataProd.map(d => {
        const code = String(d.code_dept).padStart(2, '0');
        
        const sunData = dataSoleil.find(s => String(s.code_dept).padStart(2, '0') === code);
        const topoData = topoMap.get(code); 
        
        const surface = d.surf_totale || 0;
        const production = d.total_aop || 0;
        
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

    // Configuration des métriques
    const metricConfigs = {
        soleil: { 
            interpolator: d3.interpolateYlOrRd,
            label: "Ensoleillement",
            unit: " h/an"
        },
        altitude: { 
            interpolator: d3.interpolateGnBu,
            label: "Altitude",
            unit: " m"
        },
        pente: { 
            interpolator: d3.interpolateReds,
            label: "Pente",
            unit: "%"
        },
        exposition: { 
            interpolator: d3.interpolateYlOrBr,
            label: "Exposition",
            unit: "°"
        }
    };

    const metricConfig = metricConfigs[metric];

    const labels = {
        soleil: "Ensoleillement (h/an)",
        altitude: "Altitude Moyenne (m)",
        pente: "Pente Moyenne (%)",
        exposition: "Exposition Moyenne (°)"
    };

    // Échelles de couleur
    const colorScaleRendement = d3.scaleSequential()
        .domain([0, 100])
        .interpolator(d3.interpolateYlGnBu);

    const colorScaleFactor = d3.scaleSequential()
        .domain([0, d3.max(combinedData, d => d[metric]) || 100])
        .interpolator(metricConfig.interpolator);

    // Classement des départements par rendement et par métrique
    const rankedByRendement = [...combinedData].sort((a, b) => b.rendement - a.rendement);
    const rankedByMetric = [...combinedData].sort((a, b) => b[metric] - a[metric]);
    const totalDepts = combinedData.length;

    // Container
    const container = document.createElement("div");
    container.style.fontFamily = "sans-serif";
    
    const title = document.createElement("h3");
    title.textContent = `Impact de ${metric === 'pente' ? 'la Pente' : metric === 'altitude' ? "l'Altitude" : metric === 'soleil' ? "l'Ensoleillement" : "l'Exposition"} sur le Rendement`;
    title.style.color = "#800020";
    title.style.borderBottom = "2px solid #ddd";
    title.style.paddingBottom = "10px";
    container.appendChild(title);

    // Container pour les deux cartes côte à côte et l'encadré de synthèse
    const mapsContainer = document.createElement("div");
    mapsContainer.style.display = "flex";
    mapsContainer.style.gap = "10px";
    mapsContainer.style.marginTop = "20px";
    mapsContainer.style.marginBottom = "30px";
    mapsContainer.style.justifyContent = "center";
    mapsContainer.style.alignItems = "flex-start";


    const projection = d3.geoConicConformal()
        .center([2.454071, 46.279229])
        .scale(2800)
        .translate([widthMap / 2, heightMap / 2]);
    const path = d3.geoPath().projection(projection);

    // Carte 1 : Rendement

    const rendementMapContainer = document.createElement("div");
    rendementMapContainer.style.flex = "1";
    rendementMapContainer.style.minWidth = "0";  // Important pour éviter overflow
    rendementMapContainer.style.display = "flex";
    rendementMapContainer.style.flexDirection = "column";
    
    const rendementTitle = document.createElement("h4");
    rendementTitle.textContent = "Rendement Viticole";
    rendementTitle.style.textAlign = "center";
    rendementTitle.style.color = "#555";
    rendementTitle.style.margin = "0 0 5px 0";  // Réduit pour économiser l'espace
    rendementTitle.style.fontSize = "0.95em";
    rendementTitle.style.fontWeight = "600";
    rendementMapContainer.appendChild(rendementTitle);

    const svgRendement = d3.create("svg")
        .attr("width", widthMap)
        .attr("height", heightMap)
        .attr("viewBox", [0, 0, widthMap, heightMap])
        .style("flex", "0 0 auto");

    const geojsonRendement = JSON.parse(JSON.stringify(departments));

    for (const feature of geojsonRendement.features) {
        const depCode = String(feature.properties.code).padStart(2, '0');
        const row = combinedData.find(c => c.code === depCode);
        feature.properties.value = row ? row.rendement : 0;
        feature.properties.info = row;
    }

    const gRendement = svgRendement.append("g");
    const pathsRendement = gRendement.selectAll("path")
        .data(geojsonRendement.features)
        .join("path")
        .attr("d", path)
        .attr("fill", d => d.properties.value > 0 ? colorScaleRendement(d.properties.value) : "#eee")
        .attr("stroke", "white")
        .attr("stroke-width", 0.5)
        .attr("cursor", "pointer");

    pathsRendement.filter(d => String(d.properties.code).padStart(2, '0') === codeSelection)
        .attr("stroke", "#000").attr("stroke-width", 2.5).raise();

    pathsRendement.on("click", (e, d) => { setDepartement(d.properties.code); })
        .on("mouseover", function(e, d) {
            d3.select(this).attr("stroke", "#333").attr("stroke-width", 2.5).raise();
            const info = d.properties.info;
            const depCode = String(d.properties.code).padStart(2, '0');
            if (info) {
                showTooltip(e, `
                    <strong>${d.properties.nom}</strong><br>
                    Rendement : <strong>${Math.round(info.rendement)} hl/ha</strong><br>
                    ${metricConfig.label} : <strong>${Math.round(info[metric])}${metricConfig.unit}</strong><br>
                    Surface : <strong>${Math.round(info.surface).toLocaleString()} ha</strong>
                `);
            } else {
                showTooltip(e, `<strong>${d.properties.nom}</strong><br><em>Données indisponibles</em>`);
            }
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", function(e, d) {
            const isSel = String(d.properties.code).padStart(2, '0') === codeSelection;
            d3.select(this).attr("stroke", isSel ? "#000" : "white")
                .attr("stroke-width", isSel ? 2.5 : 0.5);
            if (!isSel && codeSelection) pathsRendement.filter(p => String(p.properties.code).padStart(2, '0') === codeSelection).raise();
            hideTooltip();
        });

    rendementMapContainer.appendChild(svgRendement.node());
    
    appendMapLegend(
        rendementMapContainer, 
        colorScaleRendement, 
        [0, d3.max(combinedData, d => d.rendement) || 100], 
        "Rendement", 
        d => Math.round(d) + " hl/ha");

    // Carte 2 : Facteur selectionné

    const factorMapContainer = document.createElement("div");
    factorMapContainer.style.flex = "1";
    factorMapContainer.style.minWidth = "0";  // Important pour éviter overflow
    factorMapContainer.style.display = "flex";
    factorMapContainer.style.flexDirection = "column";
    
    const factorTitle = document.createElement("h4");
    factorTitle.textContent = metricConfig.label;  // Utiliser le vrai nom du facteur
    factorTitle.style.textAlign = "center";
    factorTitle.style.color = "#555";
    factorTitle.style.margin = "0 0 5px 0";  // Réduit pour économiser l'espace
    factorTitle.style.fontSize = "0.95em";
    factorTitle.style.fontWeight = "600";
    factorMapContainer.appendChild(factorTitle);

    const svgFactor = d3.create("svg")
        .attr("width", widthMap)
        .attr("height", heightMap)
        .style("flex", "0 0 auto")
        .attr("viewBox", [0, 0, widthMap, heightMap]);

    const geojsonFactor = JSON.parse(JSON.stringify(departments));

    for (const feature of geojsonFactor.features) {
        const depCode = String(feature.properties.code).padStart(2, '0');
        const row = combinedData.find(c => c.code === depCode);
        feature.properties.value = row ? row[metric] : 0;
        feature.properties.info = row;
    }

    const gFactor = svgFactor.append("g");
    const pathsFactor = gFactor.selectAll("path")
        .data(geojsonFactor.features)
        .join("path")
        .attr("d", path)
        .attr("fill", d => d.properties.value > 0 ? colorScaleFactor(d.properties.value) : "#eee")
        .attr("stroke", "white")
        .attr("stroke-width", 0.5)
        .attr("cursor", "pointer");

    pathsFactor.filter(d => String(d.properties.code).padStart(2, '0') === codeSelection)
        .attr("stroke", "#000").attr("stroke-width", 2.5).raise();

    pathsFactor.on("click", (e, d) => { setDepartement(d.properties.code); })
        .on("mouseover", function(e, d) {
            d3.select(this).attr("stroke", "#333").attr("stroke-width", 2.5).raise();
            const info = d.properties.info;
            if (info) {
                showTooltip(e, `
                    <strong>${d.properties.nom}</strong><br>
                    Rendement : <strong>${Math.round(info.rendement)} hl/ha</strong><br>
                    ${metricConfig.label} : <strong>${Math.round(info[metric])}${metricConfig.unit}</strong><br>
                    Surface : <strong>${Math.round(info.surface).toLocaleString()} ha</strong>
                `);
            } else {
                showTooltip(e, `<strong>${d.properties.nom}</strong><br><em>Données indisponibles</em>`);
            }
        })
        .on("mouseover", function(e, d) {
            d3.select(this).attr("stroke", "#333").attr("stroke-width", 2.5).raise();
            const info = d.properties.info;
            if (info) {
                showTooltip(e, `
                    <strong>${d.properties.nom}</strong><br>
                    Rendement : <strong>${Math.round(d.properties.value)} hl/ha</strong><br>
                    ${metricConfig.label} : <strong>${Math.round(info[metric])} ${metricConfig.unit}</strong><br>
                    Surface : <strong>${Math.round(info.surface).toLocaleString()} ha</strong>
                `);
            } else {
                showTooltip(e, `<strong>${d.properties.nom}</strong><br><em>Données indisponibles</em>`);
            }
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", function(e, d) {
            const isSel = String(d.properties.code).padStart(2, '0') === codeSelection;
            d3.select(this).attr("stroke", isSel ? "#000" : "white")
                .attr("stroke-width", isSel ? 2.5 : 0.5);
            if (!isSel && codeSelection) pathsFactor.filter(p => String(p.properties.code).padStart(2, '0') === codeSelection).raise();
            hideTooltip();
        });

    factorMapContainer.appendChild(svgFactor.node());
    
    appendMapLegend(
        factorMapContainer, 
        colorScaleFactor, 
        [0, d3.max(combinedData, d => d[metric]) || 100], 
        metricConfig.label, 
        d => Math.round(d) + " " + metricConfig.unit);

// Encadré de synthèse
    const summaryBox = document.createElement("div");
    summaryBox.style.flex = "0 0 250px";
    summaryBox.style.minHeight = "500px";
    summaryBox.style.padding = "20px";
    summaryBox.style.backgroundColor = "#f8f9fa";
    summaryBox.style.border = "1px solid #ddd";
    summaryBox.style.borderRadius = "8px";
    summaryBox.style.boxShadow = "0 2px 4px rgba(0,0,0,0.05)";

    if (codeSelection) {
        const d = combinedData.find(c => c.code === codeSelection);
        
        if (!d) {
            // Si le département n'existe pas dans les données combinées
            summaryBox.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #999; text-align: center;">
                    <p style="font-size: 30px; margin-bottom: 10px;"></p>
                    <p>Données indisponibles pour ce département.</p>
                </div>
            `;
        } else {
            const rankRendement = rankedByRendement.findIndex(r => r.code === codeSelection) + 1;
            const rankMetric = rankedByMetric.findIndex(r => r.code === codeSelection) + 1;
        
        // Récupération des AOP pour ce département
        const aopList = aopParDepartement[codeSelection] || [];
        let aopHTML = '';
        if (aopList.length > 0) {
            const maxAOPDisplay = 6;
            const displayedAOP = aopList.slice(0, maxAOPDisplay);
            const remainingCount = aopList.length - maxAOPDisplay;
            
            aopHTML = `
                <div style="margin-top: 20px; border-top: 1px dashed #ccc; padding-top: 15px;">
                    <p style="margin: 0 0 8px 0; font-size: 0.9em; color: #666; font-weight: 500;">Principales AOP :</p>
                    <ul style="margin: 0; padding-left: 20px; font-size: 0.8em; color: #555; line-height: 1.6;">
                        ${displayedAOP.map(aop => `<li>${aop}</li>`).join('')}
                        ${remainingCount > 0 ? `<li style="font-style: italic; color: #999;">+ ${remainingCount} autre${remainingCount > 1 ? 's' : ''}...</li>` : ''}
                    </ul>
                </div>
            `;
        }

        summaryBox.innerHTML = `
            <div style="text-align: center; margin-bottom: 15px;">
                <h4 style="margin: 0; color: #800020;">${d.nom} (${d.code})</h4>
                <hr style="border: 0; border-top: 1px solid #ccc; margin: 10px 0;">
            </div>
            
            <div style="margin-bottom: 20px;">
                <p style="margin: 0; font-size: 0.9em; color: #666;">Rendement :</p>
                <p style="margin: 5px 0; font-size: 1.2em; font-weight: bold;">
                    ${Math.round(d.rendement)} <span style="font-size: 0.7em;">hl/ha</span>
                </p>
                <div style="font-size: 0.85em; color: #444; background: #e9ecef; padding: 4px 8px; border-radius: 4px;">
                    Classé <strong>${rankRendement}<sup>e</sup></strong> sur ${totalDepts}
                </div>
            </div>

            <div>
                <p style="margin: 0; font-size: 0.9em; color: #666;">${metricConfig.label} :</p>
                <p style="margin: 5px 0; font-size: 1.2em; font-weight: bold;">
                    ${Math.round(d[metric])}${metricConfig.unit}
                </p>
                <div style="font-size: 0.85em; color: #444; background: #e9ecef; padding: 4px 8px; border-radius: 4px;">
                    Classé <strong>${rankMetric}<sup>e</sup></strong> sur ${totalDepts}
                </div>
            </div>

            ${aopHTML}

            <div style="margin-top: 15px; font-size: 0.8em; font-style: italic; color: #777; border-top: 1px dashed #ccc; padding-top: 10px;">
                Surface viticole : <strong>${Math.round(d.surface).toLocaleString()} ha</strong>
            </div>
        `;
        }
    } else {
        summaryBox.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #999; text-align: center;">
                <p style="font-size: 30px; margin-bottom: 10px;">🖱️</p>
                <p>Cliquez sur un département sur l'une des cartes pour voir son analyse comparative.</p>
            </div>
        `;
    }

    // Ajout des colonnes au container principal
    mapsContainer.appendChild(rendementMapContainer);
    mapsContainer.appendChild(factorMapContainer);
    mapsContainer.appendChild(summaryBox);

    container.appendChild(mapsContainer);
    
    // Graphique
    const plotContainer = document.createElement("div");
    plotContainer.style.marginTop = "20px";

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
                fill: d => colorScaleRendement(d.rendement),
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

document.getElementById('impactFactor').addEventListener('change', (e) => {
    facteurX = e.target.value;
    renderImpactDashboard();
});

loadData();