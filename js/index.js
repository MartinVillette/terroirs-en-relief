// ─── Global variables ─────────────────────────────────────────────────────────
let dataProd     = null;
let dataSoleil   = null;
let dataTopo     = null;
let dataAop      = null; // code_dept => [aop1, aop2, ...]
let departments  = null;

let departementSelectionne = null; // always a padded string e.g. "33" or null
let choixVin     = 'total_aop';    // global wine type selector
let choixProd    = 'production';   // 'production' | 'rendement'
let choixCarac   = 'ensoleillement'; // 'ensoleillement' | 'pente' | 'orientation' | 'altitude'
let facteurX     = 'soleil';       // impact factor

const renderedTabs = new Set();

// ─── Department selection ─────────────────────────────────────────────────────
function setDepartement(code) {
    const normalized = code ? String(code).padStart(2, '0') : null;
    departementSelectionne = (departementSelectionne === normalized) ? null : normalized;
    rerenderAllRenderedTabs();
}

function rerenderAllRenderedTabs() {
    renderedTabs.forEach(tabId => renderTab(tabId));
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
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
    tooltip.style("display", "block").html(html);
    moveTooltip(event);
}
function moveTooltip(event) {
    const tw = tooltip.node().offsetWidth;
    const th = tooltip.node().offsetHeight;
    let x = event.clientX + 14;
    let y = event.clientY + 14;
    if (x + tw > window.innerWidth  - 10) x = event.clientX - tw - 14;
    if (y + th > window.innerHeight - 10) y = event.clientY - th - 14;
    tooltip.style("left", x + "px").style("top", y + "px");
}
function hideTooltip() { tooltip.style("display", "none"); }

// ─── Correlation helpers ──────────────────────────────────────────────────────
function pearsonR(data, xKey, yKey) {
    const n  = data.length;
    if (n < 3) return 0;
    const mx = d3.mean(data, d => d[xKey]);
    const my = d3.mean(data, d => d[yKey]);
    const num = d3.sum(data, d => (d[xKey] - mx) * (d[yKey] - my));
    const den = Math.sqrt(
        d3.sum(data, d => (d[xKey] - mx) ** 2) *
        d3.sum(data, d => (d[yKey] - my) ** 2)
    );
    return den === 0 ? 0 : num / den;
}

function correlationLabel(r) {
    const abs = Math.abs(r);
    const dir = r >= 0 ? "positive" : "négative";
    if (abs < 0.1) return { strength: "aucune",   dir };
    if (abs < 0.3) return { strength: "faible",   dir };
    if (abs < 0.6) return { strength: "modérée",  dir };
    return             { strength: "forte",    dir };
}

// ── Reference thresholds per metric ──
const metricThresholds = {
    soleil: [
    ],
    altitude: [
        { value: 200, label: "Plaine / Coteau",         color: "#2980b9", dash: "4,4" },
        { value: 400, label: "Vignes de montagne",       color: "#8e44ad", dash: "6,3" },
    ],
    pente: [
        { value: 2,  label: "Terrain plat",             color: "#27ae60", dash: "4,4" },
        { value: 5,  label: "Forte pente (mécanisation difficile)", color: "#e74c3c", dash: "6,3" },
    ],
    exposition: [
        { value: 90,  label: "Est",                     color: "#3498db", dash: "4,4" },
        { value: 180, label: "Sud (optimal)",           color: "#e67e22", dash: "6,3" },
        { value: 270, label: "Ouest",                   color: "#3498db", dash: "4,4" },
    ],
};

// ── Qualitative evaluation for fact box ──
const metricQualitative = {
    soleil: {
        fn: (val, avg) => {
            if (val >= 2000) return { emoji: "🟢", label: "Favorable",   detail: "Ensoleillement excellent pour la maturation" };
            if (val >= 1700) return { emoji: "🟡", label: "Moyen",       detail: "Ensoleillement suffisant mais limite" };
            return                  { emoji: "🔴", label: "Défavorable", detail: "Ensoleillement insuffisant pour la maturation optimale" };
        }
    },
    altitude: {
        fn: (val, avg) => {
            if (val >= 100 && val <= 350) return { emoji: "🟢", label: "Favorable",   detail: "Altitude idéale pour la vigne" };
            if (val < 100)               return { emoji: "🟡", label: "Moyen",       detail: "Altitude très basse, risque de chaleur excessive" };
            return                              { emoji: "🟡", label: "Moyen",       detail: "Altitude élevée, maturation plus lente" };
        }
    },
    pente: {
        fn: (val, avg) => {
            if (val >= 2 && val <= 5) return { emoji: "🟢", label: "Favorable",   detail: "Pente idéale : drainage naturel et exposition solaire" };
            if (val < 2)             return { emoji: "🟡", label: "Moyen",       detail: "Terrain trop plat, risque de drainage insuffisant" };
            return                          { emoji: "🟡", label: "Moyen",       detail: "Forte pente : mécanisation difficile mais qualité souvent supérieure" };
        }
    },
    exposition: {
        fn: (val, avg) => {
            const south = val >= 135 && val <= 225;
            const seSw  = val >= 90  && val <= 270;
            if (south) return { emoji: "🟢", label: "Favorable",   detail: "Exposition plein sud : ensoleillement maximal" };
            if (seSw)  return { emoji: "🟡", label: "Moyen",       detail: "Exposition correcte (SE ou SO)" };
            return             { emoji: "🔴", label: "Défavorable", detail: "Exposition nord : ensoleillement réduit" };
        }
    },
    rendement: {
        fn: (val, avg) => {
            if (val >= avg * 1.2) return { emoji: "🟢", label: "Élevé",  detail: `Rendement supérieur à la moyenne nationale (${Math.round(avg)} hl/ha)` };
            if (val >= avg * 0.8) return { emoji: "🟡", label: "Moyen",  detail: `Proche de la moyenne nationale (${Math.round(avg)} hl/ha)` };
            return                       { emoji: "🔴", label: "Faible", detail: `Rendement inférieur à la moyenne nationale (${Math.round(avg)} hl/ha)` };
        }
    },
};

// ─── Tab switching ────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.dataset.tab;
        document.getElementById('tab-' + tabId).classList.add('active');
        if (!renderedTabs.has(tabId)) {
            renderTab(tabId);
            renderedTabs.add(tabId);
        }
    });
});

function renderTab(tabId) {
    switch (tabId) {
        case 'production':      renderProductionDashboard(); break;
        case 'caracteristiques': renderCaracDashboard();     break;
        case 'impact':          renderImpactDashboard();     break;
        case 'synthese':        renderSyntheseDashboard();   break;
    }
}

// ─── Data loading ─────────────────────────────────────────────────────────────
async function loadData() {
    try {
        const [prodData, deptData, sunData, topoData, aopData] = await Promise.all([
            d3.csv("data/processed/production_vins_2024_clean.csv", d3.autoType),
            d3.json("https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements.geojson"),
            d3.csv("data/processed/ensoleillement_france_2024.csv", d3.autoType),
            // d3.csv("data/processed/topo_par_departement_old.csv", d3.autoType),
            d3.csv("data/processed/topo_par_departement.csv", d3.autoType),
            d3.json("data/processed/aop_par_departement.json", d3.autoType)
        ]);
        dataProd   = prodData;
        departments = deptData;
        dataSoleil  = sunData;
        dataTopo    = topoData;
        dataAop     = aopData;

        renderProductionDashboard();
        renderedTabs.add('production');
    } catch (error) {
        document.getElementById('production-dashboard').innerHTML =
            `<div style="color:red;padding:20px;">Erreur de chargement : ${error.message}</div>`;
    }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
function appendMapLegend(containerDiv, colorScale, domain, label, format = d => Math.round(d)) {
    const legendWidth = 200, legendHeight = 12;
    const margin = { left: 10, right: 10, top: 20, bottom: 20 };
    const totalWidth  = legendWidth  + margin.left + margin.right;
    const totalHeight = legendHeight + margin.top  + margin.bottom;

    const svgLegend = d3.create("svg").attr("width", totalWidth).attr("height", totalHeight);
    const defs = svgLegend.append("defs");
    const gradientId = "legend-gradient-" + Math.random().toString(36).substr(2, 9);
    const gradient = defs.append("linearGradient")
        .attr("id", gradientId).attr("x1", "0%").attr("x2", "100%");

    d3.range(11).forEach(i => {
        const t = i / 10;
        gradient.append("stop")
            .attr("offset", `${t * 100}%`)
            .attr("stop-color", colorScale(domain[0] + t * (domain[1] - domain[0])));
    });

    const g = svgLegend.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    g.append("text").attr("x", legendWidth / 2).attr("y", -6)
        .attr("font-size", 11).attr("font-weight", "bold").attr("fill", "#333")
        .attr("text-anchor", "middle").text(label);
    g.append("rect").attr("width", legendWidth).attr("height", legendHeight)
        .attr("rx", 2).style("fill", `url(#${gradientId})`);
    [{ x: 0, anchor: "start", val: domain[0] },
     { x: legendWidth / 2, anchor: "middle", val: (domain[0] + domain[1]) / 2 },
     { x: legendWidth, anchor: "end", val: domain[1] }].forEach(({ x, anchor, val }) => {
        g.append("text").attr("x", x).attr("y", legendHeight + 14)
            .attr("font-size", 10).attr("fill", "#555")
            .attr("text-anchor", anchor).text(format(val));
    });
    containerDiv.appendChild(svgLegend.node());
}

function appendMapSource(containerDiv, source, url = null) {
    const div = document.createElement("div");
    div.style.cssText = "font-size:11px;color:#999;margin-top:4px;font-style:italic;";
    div.innerHTML = url
        ? `Source : <a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#999;text-decoration:underline;">${source}</a>`
        : `Source : ${source}`;
    containerDiv.appendChild(div);
}

function renderDistributionChart(data, metric, unit, colorScale, width, height, title) {
    const values = data.map(d => d[metric]).filter(v => v != null && v > 0);
    const binGenerator = d3.bin().thresholds(12)(values);
    const binData = binGenerator.map(b => ({
        x0: b.x0, x1: b.x1, count: b.length,
        midVal: (b.x0 + b.x1) / 2,
        label: `${Math.round(b.x0)} - ${Math.round(b.x1)} ${unit}`
    }));

    return Plot.plot({
        title, width, height,
        marginLeft: 50, marginBottom: 40,
        x: { label: unit, tickFormat: "s" },
        y: { label: "Nb. départements", grid: true },
        marks: [
            Plot.rectY(binData, {
                x1: "x0", x2: "x1", y: "count",
                fill: d => colorScale(d.midVal),
                fillOpacity: 0.85,
                title: d => `${d.label}\n${d.count} département(s)`
            }),
            Plot.ruleY([0])
        ]
    });
}

// ─── Shared map builder ───────────────────────────────────────────────────────
/**
 * Builds a choropleth map SVG.
 * @param {object[]} features     - GeoJSON features (already value-annotated)
 * @param {function} colorFn      - d => fill color string
 * @param {function} tooltipFn    - d => tooltip HTML string
 * @param {number}   width
 * @param {number}   height
 * @param {string}   codeSelection
 * @param {function} onClickFn    - code => void
 * @param {number} scale          - map scale
 */
function buildChoroplethMap(features, colorFn, tooltipFn, width, height, codeSelection, onClickFn, scale = 2600) {
    const svg = d3.create("svg")
        .attr("width", width).attr("height", height)
        .attr("viewBox", [0, 0, width, height]);

    const projection = d3.geoConicConformal()
        .center([2.454071, 46.279229]).scale(scale)
        .translate([width / 2, height / 2]);
    const path = d3.geoPath().projection(projection);

    const g = svg.append("g");
    const paths = g.selectAll("path").data(features).join("path")
        .attr("d", path)
        .attr("fill", colorFn)
        .attr("stroke", d => String(d.properties.code).padStart(2, '0') === codeSelection ? "#000" : "white")
        .attr("stroke-width", d => String(d.properties.code).padStart(2, '0') === codeSelection ? 2.5 : 0.5)
        .attr("cursor", "pointer");

    paths.filter(d => String(d.properties.code).padStart(2, '0') === codeSelection).raise();

    paths
        .on("click", (e, d) => onClickFn(d.properties.code))
        .on("mouseover", function(e, d) {
            d3.select(this).attr("stroke", "#333").attr("stroke-width", 2).raise();
            showTooltip(e, tooltipFn(d));
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", function(e, d) {
            const isSel = String(d.properties.code).padStart(2, '0') === codeSelection;
            d3.select(this)
                .attr("stroke", isSel ? "#000" : "white")
                .attr("stroke-width", isSel ? 2.5 : 0.5);
            if (!isSel && codeSelection)
                paths.filter(p => String(p.properties.code).padStart(2, '0') === codeSelection).raise();
            hideTooltip();
        });

    return svg.node();
}

/**
 * Builds the standard two-column + bottom-row layout.
 * @param {HTMLElement} mapEl        - left top element (map SVG)
 * @param {HTMLElement} legendEl     - appended below mapEl (optional, pass null)
 * @param {HTMLElement} sourceEl     - source note
 * @param {HTMLElement} barChartEl   - right top element
 * @param {HTMLElement} histChartEl  - bottom full-width element
 * @param {HTMLElement} extraEl      - optional extra element below histogram
 */

function buildDashboardLayout(mapEl, legendEl, sourceEl, barChartEl, histChartEl, factBoxEl = null,
                               widthMap = 500, widthChart = 420, heightMap = 500, gap = 20) {

    const bottomHeight = 380;

    const wrapper = document.createElement("div");
    wrapper.style.cssText = `display:grid;grid-template-columns:${widthMap}px ${widthChart}px;grid-template-rows:auto ${bottomHeight}px;gap:${gap}px;`;

    // ── Top left : map + legend + source ──
    const topLeft = document.createElement("div");
    topLeft.style.cssText = "display:flex;flex-direction:column;";
    topLeft.appendChild(mapEl);
    if (legendEl) topLeft.appendChild(legendEl);
    if (sourceEl) topLeft.appendChild(sourceEl);

    // ── Top right : fact box ──
    const topRight = document.createElement("div");
    topRight.style.cssText = "display:flex;flex-direction:column;";
    if (factBoxEl) topRight.appendChild(factBoxEl);

    // ── Bottom left : distribution histogram (fixed height) ──
    const bottomLeft = document.createElement("div");
    bottomLeft.style.cssText = `display:flex;flex-direction:column;height:${bottomHeight}px;overflow:hidden;`;
    bottomLeft.appendChild(histChartEl);

    // ── Bottom right : top10 bar chart (fixed height) ──
    const bottomRight = document.createElement("div");
    bottomRight.style.cssText = `display:flex;flex-direction:column;height:${bottomHeight}px;overflow:hidden;`;
    bottomRight.appendChild(barChartEl);

    wrapper.appendChild(topLeft);
    wrapper.appendChild(topRight);
    wrapper.appendChild(bottomLeft);
    wrapper.appendChild(bottomRight);

    return wrapper;
}


// ─── Wine type configs ────────────────────────────────────────────────────────
const wineThemes = {
    total_aop: { scale: d3.interpolatePuRd, color: "#8e24aa", label: "Production Totale AOP" },
    aop_rouge: { scale: d3.interpolateReds,  color: "#d32f2f", label: "Vin Rouge AOP" },
    aop_blanc: { scale: d3.interpolateYlGn,  color: "#9ccc65", label: "Vin Blanc AOP" },
    aop_rose:  { scale: d3.interpolateRdPu,  color: "#f06292", label: "Vin Rosé AOP" }
};

// ─── Production Dashboard ─────────────────────────────────────────────────────
function renderProductionDashboard() {
    if (!dataProd || !departments) return;

    const widthMap = 500, heightMap = 500, widthChart = 420, heightChart = 380;
    const totalWidth = widthMap + widthChart + 20;
    const codeSelection = departementSelectionne;

    if (choixProd === 'production') {
        renderProductionVolume(widthMap, heightMap, widthChart, heightChart, totalWidth, codeSelection);
    } else {
        renderProductionRendement(widthMap, heightMap, widthChart, heightChart, totalWidth, codeSelection);
    }
}

function renderProductionVolume(widthMap, heightMap, widthChart, heightChart, totalWidth, codeSelection) {
    const metric = choixVin;
    const theme  = wineThemes[metric];
    const maxVal = d3.max(dataProd, d => d[metric]) || 10000;
    const colorScale = d3.scaleSequential([0, maxVal], theme.scale);

    const geojson = JSON.parse(JSON.stringify(departments));
    geojson.features.forEach(f => {
        const row = dataProd.find(d => String(d.code_dept).padStart(2, '0') === f.properties.code);
        f.properties.value = row ? row[metric] : 0;
    });

    const mapEl = buildChoroplethMap(
        geojson.features,
        d => d.properties.value > 0 ? colorScale(d.properties.value) : "#eee",
        d => `<strong>${d.properties.nom}</strong><br>${theme.label} : <strong>${Math.round(d.properties.value).toLocaleString()} hl</strong>`,
        widthMap, heightMap, codeSelection,
        code => setDepartement(code)
    );

    const legendDiv = document.createElement("div");
    appendMapLegend(legendDiv, colorScale, [0, maxVal], theme.label + " (hl)", d => (d / 1000).toFixed(0) + "k");

    const sourceDiv = document.createElement("div");
    appendMapSource(sourceDiv, "Douane.gouv", "https://www.douane.gouv.fr/la-douane/opendata/mots-cles/recolte");

    // ── Top 10 ──
    const topData = [...dataProd].sort((a, b) => d3.descending(a[metric], b[metric])).slice(0, 10);
    const barChart = Plot.plot({
        title: `Top 10 : ${theme.label} (hl)`,
        marginLeft: 120, width: widthChart, height: heightChart,
        x: { label: null, grid: true, tickFormat: "s" },
        y: { label: null },
        marks: [
            Plot.barX(topData, {
                x: metric, y: "nom_dept",
                fill: d => String(d.code_dept).padStart(2, '0') === codeSelection ? "#222" : colorScale(d[metric]),
                sort: { y: "x", reverse: true }
            }),
            Plot.text(topData, {
                x: metric, y: "nom_dept",
                text: d => (d[metric] / 1000).toFixed(0) + "k",
                textAnchor: "start", dx: 5, fill: "#444", fontSize: 10
            })
        ]
    });

    // ── Histogram ──
    const factBoxWidth = 220;
    const histWidth = widthMap + widthChart + 20 - 20 - factBoxWidth;
    const histChart = renderDistributionChart(
        dataProd, metric, "hl", colorScale, histWidth, 380,
        `Répartition par volume (${theme.label})`
    );

    // ── Fact box ──
    const factBox = buildFactBox(codeSelection, dataProd, metric, colorScale, "hl",
        d => (d[metric] / 1000).toFixed(0) + "k hl", theme.color);

    const layout = buildDashboardLayout(
        mapEl, legendDiv.firstChild, sourceDiv.firstChild,
        barChart, histChart, factBox,
        widthMap, widthChart, heightMap
    );

    const container = document.getElementById('production-dashboard');
    container.innerHTML = '';
    container.appendChild(layout);
}

function renderProductionRendement(widthMap, heightMap, widthChart, heightChart, totalWidth, codeSelection) {
    const combinedData = dataProd.map(d => {
        const code       = String(d.code_dept).padStart(2, '0');
        const surface    = d.surf_totale || 0;
        const production = d[choixVin]   || 0;
        const rendement  = surface > 20 ? production / surface : 0;
        return { code, nom_dept: d.nom_dept, surface, production, rendement };
    }).filter(d => d.rendement > 0);

    const maxVal = d3.max(combinedData, d => d.rendement) || 100;
    const colorScale = d3.scaleSequential([0, maxVal], d3.interpolateYlGnBu);

    const geojson = JSON.parse(JSON.stringify(departments));
    geojson.features.forEach(f => {
        const row = combinedData.find(d => d.code === f.properties.code);
        f.properties.value = row ? row.rendement : 0;
    });

    const mapEl = buildChoroplethMap(
        geojson.features,
        d => d.properties.value > 0 ? colorScale(d.properties.value) : "#eee",
        d => `<strong>${d.properties.nom}</strong><br>Rendement : <strong>${Math.round(d.properties.value)} hl/ha</strong>`,
        widthMap, heightMap, codeSelection,
        code => setDepartement(code)
    );

    const legendDiv = document.createElement("div");
    appendMapLegend(legendDiv, colorScale, [0, maxVal], "Rendement (hl/ha)", d => Math.round(d) + " hl/ha");

    const sourceDiv = document.createElement("div");
    appendMapSource(sourceDiv, "Douane.gouv", "https://www.douane.gouv.fr/la-douane/opendata/mots-cles/recolte");

    // ── Top 10 ──
    const topData = [...combinedData].sort((a, b) => d3.descending(a.rendement, b.rendement)).slice(0, 10);
    const barChart = Plot.plot({
        title: "Top 10 : Rendement (hl/ha)",
        marginLeft: 140, width: widthChart, height: heightChart,
        x: { label: "hl/ha", grid: true },
        y: { label: null },
        marks: [
            Plot.barX(topData, {
                x: "rendement", y: "nom_dept",
                fill: d => d.code === codeSelection ? "#222" : colorScale(d.rendement),
                sort: { y: "x", reverse: true }
            }),
            Plot.text(topData, {
                x: "rendement", y: "nom_dept",
                text: d => Math.round(d.rendement) + " hl/ha",
                textAnchor: "start", dx: 5, fill: "#444", fontSize: 10
            })
        ]
    });

    const factBoxWidth = 220;
    const histWidth = widthMap + widthChart + 20 - 20 - factBoxWidth;
    const histChart = renderDistributionChart(
        combinedData, "rendement", "hl/ha", colorScale, histWidth, 380,
        "Répartition des départements par rendement"
    );

    const factBox = buildFactBox(codeSelection, combinedData, "rendement", colorScale, "hl/ha",
        d => Math.round(d.rendement) + " hl/ha", "#1976d2");

    const layout = buildDashboardLayout(
        mapEl, legendDiv.firstChild, sourceDiv.firstChild,
        barChart, histChart, factBox,
        widthMap, widthChart, heightMap
    );

    const container = document.getElementById('production-dashboard');
    container.innerHTML = '';
    container.appendChild(layout);
}

// ─── Caractéristiques Dashboard ───────────────────────────────────────────────
function renderCaracDashboard() {
    if (!departments) return;
    switch (choixCarac) {
        case 'ensoleillement': renderCaracSoleil();  break;
        case 'pente':          renderCaracTopo('pente');      break;
        case 'orientation':    renderCaracTopo('exposition'); break;
        case 'altitude':       renderCaracTopo('altitude');   break;
    }
}

function renderCaracSoleil() {
    if (!dataSoleil) return;

    const widthMap = 500, heightMap = 500, widthChart = 420, heightChart = 380;
    const codeSelection = departementSelectionne;

    const maxVal = d3.max(dataSoleil, d => d.heures_soleil) || 3000;
    const colorScale = d3.scaleSequential([0, maxVal], d3.interpolateYlOrRd);

    const geojson = JSON.parse(JSON.stringify(departments));
    geojson.features.forEach(f => {
        const row = dataSoleil.find(d => String(d.code_dept).padStart(2, '0') === f.properties.code);
        f.properties.value = row ? row.heures_soleil : 0;
    });

    const mapEl = buildChoroplethMap(
        geojson.features,
        d => d.properties.value > 0 ? colorScale(d.properties.value) : "#eee",
        d => `<strong>${d.properties.nom}</strong><br>Ensoleillement : <strong>${Math.round(d.properties.value).toLocaleString()} h/an</strong>`,
        widthMap, heightMap, codeSelection,
        code => setDepartement(code)
    );

    const legendDiv = document.createElement("div");
    appendMapLegend(legendDiv, colorScale, [0, maxVal], "Ensoleillement (h/an)", d => Math.round(d) + "h");

    const sourceDiv = document.createElement("div");
    appendMapSource(sourceDiv, "linternaute.com", "https://www.petitlopin.fr/?map=ensoleillement");

    // ── Top 10 ──
    const barChart = Plot.plot({
        title: "Top 10 : Ensoleillement (h/an)",
        marginLeft: 140, width: widthChart, height: heightChart,
        x: { label: "h/an", grid: true, tickFormat: "s" },
        y: { label: null },
        marks: [
            Plot.barX(dataSoleil, {
                x: "heures_soleil", y: "nom_dept",
                fill: d => String(d.code_dept).padStart(2, '0') === codeSelection ? "#222" : colorScale(d.heures_soleil),
                sort: { y: "x", reverse: true, limit: 10 }
            }),
            Plot.text(dataSoleil, {
                x: "heures_soleil", y: "nom_dept",
                text: d => (d.heures_soleil / 1000).toFixed(1) + "k",
                textAnchor: "start", dx: 5, fill: "#666", fontSize: 10,
                sort: { y: "x", reverse: true, limit: 10 }
            })
        ]
    });

    const factBoxWidth = 220;
    const histWidth = widthMap + widthChart + 20 - 20 - factBoxWidth;
    const histChart = renderDistributionChart(
        dataSoleil, "heures_soleil", "h/an", colorScale, histWidth, 380,
        "Répartition des départements par ensoleillement"
    );

    const dataForFact = dataSoleil.map(d => ({ ...d, code: String(d.code_dept).padStart(2, '0') }));
    const factBox = buildFactBox(codeSelection, dataForFact, "heures_soleil", colorScale, "h/an",
        d => Math.round(d.heures_soleil) + " h/an", "#f39c12");

    const layout = buildDashboardLayout(
        mapEl, legendDiv.firstChild, sourceDiv.firstChild,
        barChart, histChart, factBox,
        widthMap, widthChart, heightMap
    );

    const container = document.getElementById('caracteristiques-dashboard');
    container.innerHTML = '';
    container.appendChild(layout);
}

function renderCaracTopo(metric) {
    if (!dataTopo) return;

    const widthMap = 500, heightMap = 500, widthChart = 420, heightChart = 380;
    const codeSelection = departementSelectionne;

    const deptNamesMap = new Map();
    departments.features.forEach(f => deptNamesMap.set(f.properties.code, f.properties.nom));
    const enriched = dataTopo.map(d => ({
        ...d,
        code: String(d.code_dep).padStart(2, '0'),
        nom_dept: deptNamesMap.get(String(d.code_dep).padStart(2, '0')) || `Dept ${d.code_dep}`
    }));

    const configs = {
        pente:      { interpolator: d3.interpolateReds,   domainMax: 15,   label: "Pente",      unit: "%" },
        altitude:   { interpolator: d3.interpolateGnBu,   domainMax: null, label: "Altitude",   unit: "m" },
        exposition: { interpolator: d3.interpolateYlOrBr, domainMax: 360,  label: "Exposition", unit: "°" }
    };

    const cfg = configs[metric];
    const domainMax  = cfg.domainMax || d3.max(enriched, d => d[metric]) || 100;
    const colorScale = d3.scaleSequential([0, domainMax], cfg.interpolator);

    const geojson = JSON.parse(JSON.stringify(departments));
    geojson.features.forEach(f => {
        const row = enriched.find(d => d.code === f.properties.code);
        f.properties.value = row ? row[metric] : 0;
    });

    let mapEl;
    if (metric === "exposition") {
        mapEl = buildExpositionMap(geojson.features, enriched, widthMap, heightMap, codeSelection, d => `<strong>${d.properties.nom}</strong><br>Exposition : <strong>${Math.round(d.properties.value)}°</strong>`);
    } else {
        mapEl = buildChoroplethMap(
            geojson.features,
            d => d.properties.value > 0 ? colorScale(d.properties.value) : "#eee",
            d => `<strong>${d.properties.nom}</strong><br>${cfg.label} : <strong>${d.properties.value.toFixed(1)} ${cfg.unit}</strong>`,
            widthMap, heightMap, codeSelection,
            code => setDepartement(code)
        );
    }

    let legendEl;
    if (metric !== "exposition") {
        const legendDiv = document.createElement("div");
        appendMapLegend(legendDiv, colorScale, [0, domainMax], `${cfg.label} (${cfg.unit})`,
            d => metric === "altitude" ? Math.round(d) + "m" : d.toFixed(1) + cfg.unit);
        legendEl = legendDiv.firstChild;
    } else {
        legendEl = document.createElement("div");
        legendEl.style.cssText = "font-size:11px;color:#555;margin-top:6px;";
        legendEl.innerHTML = `<strong>Légende :</strong> chaque flèche indique l'exposition solaire moyenne des vignes du département`;
    }

    const sourceDiv = document.createElement("div");
    appendMapSource(sourceDiv, "INRAE", "https://entrepot.recherche.data.gouv.fr/dataset.xhtml?persistentId=doi:10.57745/KBTLDH");

    // ── Top 10 or rose ──
    let barChart   = null;
    let factBox    = null;
    let topRightEl = null;
    let bottomRightEl = document.createElement("div");
    
    if (metric === "exposition") {
        // Rose chart goes TOP RIGHT, bottom right is empty
        topRightEl    = renderExpositionRoseChart(enriched, codeSelection, widthChart, heightChart);
        bottomRightEl = document.createElement("div");
    } else {
        const topData = [...enriched].filter(d => d[metric] > 0)
            .sort((a, b) => d3.descending(a[metric], b[metric])).slice(0, 10);
        barChart = Plot.plot({
            title: `Top 10 : ${cfg.label} (${cfg.unit})`,
            marginLeft: 140, width: widthChart, height: heightChart,
            x: { label: cfg.unit, grid: true },
            y: { label: null },
            marks: [
                Plot.barX(topData, {
                    x: metric, y: "nom_dept",
                    fill: d => d.code === codeSelection ? "#222" : colorScale(d[metric]),
                    sort: { y: "x", reverse: true }
                }),
                Plot.text(topData, {
                    x: metric, y: "nom_dept",
                    text: d => metric === "altitude" ? Math.round(d[metric]) + "m" : d[metric].toFixed(1) + cfg.unit,
                    textAnchor: "start", dx: 5, fill: "#666", fontSize: 10
                })
            ]
        });
        topRightEl    = buildFactBox(codeSelection, enriched, metric, colorScale, cfg.unit,
            d => metric === "altitude" ? Math.round(d[metric]) + "m" : d[metric].toFixed(1) + cfg.unit,
            d3.schemeTableau10[Object.keys(configs).indexOf(metric)]);
        bottomRightEl = barChart;
    }

    // ── Histogram + fact box ──
    const factBoxWidth = 220;
    const histWidth    = widthMap + widthChart + 20 - 20 - factBoxWidth;

    const histChart = metric !== "exposition"
        ? renderDistributionChart(enriched, metric, cfg.unit, colorScale, histWidth, 380,
            `Répartition des départements par ${cfg.label.toLowerCase()}`)
        : document.createElement("div");

    const layout = buildDashboardLayout(
        mapEl, legendEl, sourceDiv.firstChild,
        bottomRightEl,   // bottom right
        histChart,        // bottom left
        topRightEl,       // top right
        widthMap, widthChart, heightMap
    );

    const container = document.getElementById('caracteristiques-dashboard');
    container.innerHTML = '';
    container.appendChild(layout);
}

function buildExpositionMap(features, enriched, width, height, codeSelection, tooltipFunction, scale = 2600) {
    const svg = d3.create("svg").attr("width", width).attr("height", height).attr("viewBox", [0, 0, width, height]);
    const projection = d3.geoConicConformal().center([2.454071, 46.279229]).scale(scale).translate([width / 2, height / 2]);
    const path = d3.geoPath().projection(projection);
    const g = svg.append("g");

    g.selectAll("path").data(features).join("path")
        .attr("d", path)
        .attr("fill", d => d.properties.value > 0 ? "#e8e0d0" : "#eee")
        .attr("stroke", d => String(d.properties.code).padStart(2, '0') === codeSelection ? "#000" : "white")
        .attr("stroke-width", d => String(d.properties.code).padStart(2, '0') === codeSelection ? 2.5 : 0.5)
        .attr("cursor", "pointer")
        .on("click", (e, d) => setDepartement(d.properties.code))
        .on("mouseover", function(e, d) {
            d3.select(this).attr("stroke", "#333").attr("stroke-width", 2).raise();
            g.selectAll(".arrow-group").raise();
            showTooltip(e, tooltipFunction(d));
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", function(e, d) {
            const isSel = String(d.properties.code).padStart(2, '0') === codeSelection;
            d3.select(this).attr("stroke", isSel ? "#000" : "white").attr("stroke-width", isSel ? 2.5 : 0.5);
            g.selectAll(".arrow-group").raise();
            hideTooltip();
        });

    features.forEach(feature => {
        if (!feature.properties.value) return;
        const centroid = path.centroid(feature);
        if (isNaN(centroid[0]) || isNaN(centroid[1])) return;
        const angleDeg = feature.properties.value;
        const angleRad = (angleDeg - 90) * Math.PI / 180;
        const isSelected = String(feature.properties.code).padStart(2, '0') === codeSelection;
        const arrowLen = isSelected ? 14 : 10;
        const color = isSelected ? "#d32f2f" : "#555";
        const strokeW = isSelected ? 2.5 : 1.5;

        const arrowGroup = g.append("g").attr("class", "arrow-group")
            .attr("transform", `translate(${centroid[0]},${centroid[1]})`).attr("cursor", "pointer")
            .on("click", () => setDepartement(feature.properties.code))
            .on("mouseover", e => showTooltip(e, tooltipFunction(feature)))
            .on("mousemove", moveTooltip).on("mouseout", hideTooltip);

        const dx = Math.cos(angleRad) * arrowLen, dy = Math.sin(angleRad) * arrowLen;
        arrowGroup.append("line")
            .attr("x1", -dx * 0.4).attr("y1", -dy * 0.4).attr("x2", dx * 0.8).attr("y2", dy * 0.8)
            .attr("stroke", color).attr("stroke-width", strokeW).attr("stroke-linecap", "round");

        const headLen = arrowLen * 0.45, headAngle = 0.45;
        const tipX = dx * 0.8, tipY = dy * 0.8;
        const lx = tipX - headLen * Math.cos(angleRad - headAngle), ly = tipY - headLen * Math.sin(angleRad - headAngle);
        const rx = tipX - headLen * Math.cos(angleRad + headAngle), ry = tipY - headLen * Math.sin(angleRad + headAngle);
        arrowGroup.append("polygon").attr("points", `${tipX},${tipY} ${lx},${ly} ${rx},${ry}`).attr("fill", color);
    });

    return svg.node();
}

// ─── Exposition helpers ───────────────────────────────────────────────────────
function expositionToCardinal(deg) {
    const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
    return dirs[Math.round(deg / 22.5) % 16];
}

function renderExpositionRoseChart(data, codeSelection, width, height) {
    const size = Math.min(width, height);
    const cx = size / 2, cy = size / 2, radius = size / 2 - 40;
    const numBins = 36;
    const bins = Array.from({ length: numBins }, (_, i) => ({ angle: i * 10, angleMid: i * 10 + 5, count: 0, departments: [] }));

    data.forEach(d => {
        if (d.exposition > 0) {
            const idx = Math.floor(d.exposition / 10) % numBins;
            bins[idx].count++;
            bins[idx].departments.push(d);
        }
    });

    const maxCount = d3.max(bins, d => d.count) || 1;
    const svg = d3.create("svg").attr("width", size).attr("height", size + 40).attr("viewBox", [0, 0, size, size + 40]);

    svg.append("text").attr("x", cx).attr("y", 20).attr("text-anchor", "middle")
        .attr("font-size", 14).attr("font-weight", "bold").attr("fill", "#333")
        .text("Exposition des vignes (par tranche de 10°)");

    const g = svg.append("g").attr("transform", `translate(${cx},${cy + 40})`);

    for (let i = 1; i <= 4; i++) {
        const r = (radius * i) / 4;
        g.append("circle").attr("r", r).attr("fill", "none").attr("stroke", "#ddd").attr("stroke-dasharray", "3,3");
        g.append("text").attr("x", 4).attr("y", -r + 4).attr("font-size", 10).attr("fill", "#aaa")
            .text(Math.round((maxCount * i) / 4));
    }

    [{ angle: 0, label: "N" }, { angle: 45, label: "NE" }, { angle: 90, label: "E" },
     { angle: 135, label: "SE" }, { angle: 180, label: "S" }, { angle: 225, label: "SO" },
     { angle: 270, label: "O" }, { angle: 315, label: "NO" }].forEach(({ angle, label }) => {
        const rad = (angle - 90) * Math.PI / 180;
        g.append("line").attr("x1", 0).attr("y1", 0)
            .attr("x2", Math.cos(rad) * radius).attr("y2", Math.sin(rad) * radius)
            .attr("stroke", "#ccc").attr("stroke-width", 0.5);
        g.append("text")
            .attr("x", Math.cos(rad) * (radius + 20)).attr("y", Math.sin(rad) * (radius + 20))
            .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
            .attr("font-size", 11).attr("font-weight", "bold").attr("fill", "#555").text(label);
    });

    bins.forEach((bin, i) => {
        if (bin.count === 0) return;
        const r = (bin.count / maxCount) * radius;
        const startAngle = (i * 10 - 90) * Math.PI / 180;
        const endAngle   = ((i + 1) * 10 - 90) * Math.PI / 180;
        const x1 = Math.cos(startAngle) * r, y1 = Math.sin(startAngle) * r;
        const x2 = Math.cos(endAngle)   * r, y2 = Math.sin(endAngle)   * r;
        const hasSelected = codeSelection && bin.departments.some(d => String(d.code_dep).padStart(2, '0') === codeSelection);

        g.append("path")
            .attr("d", `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`)
            .attr("fill", hasSelected ? "#d32f2f" : "#f57c00")
            .attr("fill-opacity", 0.75).attr("stroke", "white").attr("stroke-width", 0.5)
            .append("title").text(`${bin.angle}° - ${bin.angle + 10}°\n${bin.count} département(s)\n${bin.departments.map(d => d.nom_dept).join(", ")}`);
    });

    g.append("circle").attr("r", 3).attr("fill", "#333");
    return svg.node();
}

// ...existing code...

// ─── Impact Dashboard ─────────────────────────────────────────────────────────
function renderImpactDashboard() {
    if (!dataProd || !dataSoleil || !dataTopo || !departments) {
        document.getElementById('impact-dashboard').innerHTML = '<div class="loading">Chargement...</div>';
        return;
    }

    const codeSelection = departementSelectionne;
    const metric        = facteurX;
    const widthMap      = 460, heightMap = 500, heightPlot = 380, width = 1000;

    const topoMap = new Map(dataTopo.map(d => [String(d.code_dep).padStart(2, '0'), d]));

    const combinedData = dataProd.map(d => {
        const code     = String(d.code_dept).padStart(2, '0');
        const sunData  = dataSoleil.find(s => String(s.code_dept).padStart(2, '0') === code);
        const topoData = topoMap.get(code);
        const surface    = d.surf_totale || 0;
        const production = d[choixVin]   || 0;
        const rendement  = surface > 20 ? production / surface : 0;
        return {
            code, nom: d.nom_dept, surface, production, rendement,
            soleil:     sunData  ? sunData.heures_soleil : 0,
            altitude:   topoData ? topoData.altitude     : 0,
            pente:      topoData ? topoData.pente        : 0,
            exposition: topoData ? topoData.exposition   : 0,
        };
    }).filter(d => d.rendement > 0 && d[metric] > 0);

    const metricConfigs = {
        soleil:     { interpolator: d3.interpolateYlOrRd, label: "Ensoleillement", unit: " h/an" },
        altitude:   { interpolator: d3.interpolateGnBu,   label: "Altitude",       unit: " m"    },
        pente:      { interpolator: d3.interpolateReds,   label: "Pente",          unit: "%"     },
        exposition: { interpolator: d3.interpolateYlOrBr, label: "Exposition",     unit: "°"     },
    };
    const metricConfig = metricConfigs[metric];
    const labels = {
        soleil:     "Ensoleillement (h/an)",
        altitude:   "Altitude Moyenne (m)",
        pente:      "Pente Moyenne (%)",
        exposition: "Exposition Moyenne (°)",
    };

    const colorScaleRendement = d3.scaleSequential([0, 100], d3.interpolateYlGnBu);
    const colorScaleFactor    = d3.scaleSequential(
        [0, d3.max(combinedData, d => d[metric]) || 100],
        metricConfig.interpolator
    );

    const container = document.createElement("div");
    container.style.fontFamily = "sans-serif";

    // ── Unified tooltip ──
    const unifiedTooltip = (f) => {
        const info = f.properties.info;
        if (!info) return `<strong>${f.properties.nom}</strong><br><em>Données indisponibles</em>`;
        const metricValue = metric === 'exposition' 
            ? Math.round(info[metric]) + '° (' + expositionToCardinal(info[metric]) + ')'
            : metric === 'altitude'
            ? Math.round(info[metric]) + ' m'
            : metric === 'pente'
            ? info[metric].toFixed(1) + '%'
            : Math.round(info[metric]) + metricConfig.unit;
        return `
            <strong>${info.nom}</strong>
            <hr style="margin:4px 0;border:none;border-top:1px solid #ddd;">
            Rendement : <strong>${Math.round(info.rendement)} hl/ha</strong><br>
            ${metric === 'soleil' ? 'Ensoleillement' : metric === 'altitude' ? 'Altitude' : metric === 'pente' ? 'Pente' : 'Exposition'} : <strong>${metricValue}</strong><br>
            Surface : <strong>${Math.round(info.surface).toLocaleString()} ha</strong>
        `;
    };

    // ── Two maps side by side + fact box ──
    const mapsContainer = document.createElement("div");
    mapsContainer.style.cssText = "display:flex;gap:20px;margin-bottom:20px;align-items:flex-start;";

    const reducedScale = 2600 * (widthMap / 500); // Reduced scale for side by side display

    // Map 1: Rendement
    const geojsonR = JSON.parse(JSON.stringify(departments));
    geojsonR.features.forEach(f => {
        const row = combinedData.find(c => c.code === f.properties.code);
        f.properties.value = row ? row.rendement : 0;
        f.properties.info  = row || null;
    });

    const rendementMapContainer = document.createElement("div");
    rendementMapContainer.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column;";
    const rendementTitle = document.createElement("h4");
    rendementTitle.textContent = "Rendement Viticole";
    rendementTitle.style.cssText = "text-align:center;color:#555;margin:0 0 5px 0;font-size:0.95em;";
    rendementMapContainer.appendChild(rendementTitle);
    rendementMapContainer.appendChild(buildChoroplethMap(
        geojsonR.features,
        d => d.properties.value > 0 ? colorScaleRendement(d.properties.value) : "#eee",
        unifiedTooltip,
        widthMap, heightMap, codeSelection,
        code => setDepartement(code),
        reducedScale
    ));
    appendMapLegend(rendementMapContainer, colorScaleRendement,
        [0, d3.max(combinedData, d => d.rendement) || 100],
        "Rendement (hl/ha)", d => Math.round(d) + " hl/ha");

    // Map 2: Factor
    const geojsonF = JSON.parse(JSON.stringify(departments));
    geojsonF.features.forEach(f => {
        const row = combinedData.find(c => c.code === f.properties.code);
        f.properties.value = row ? row[metric] : 0;
        f.properties.info  = row || null;
    });

    const factorMapContainer = document.createElement("div");
    factorMapContainer.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column;";
    const factorTitle = document.createElement("h4");
    factorTitle.textContent = metricConfig.label;
    factorTitle.style.cssText = "text-align:center;color:#555;margin:0 0 5px 0;font-size:0.95em;";
    factorMapContainer.appendChild(factorTitle);
    
    // Use vector map for exposition, choropleth for others
    if (metric === 'exposition') {
        factorMapContainer.appendChild(buildExpositionMap(
            geojsonF.features,
            combinedData,
            widthMap, heightMap, codeSelection,
            unifiedTooltip,
            reducedScale
        ));
    } else {
        factorMapContainer.appendChild(buildChoroplethMap(
            geojsonF.features,
            d => d.properties.value > 0 ? colorScaleFactor(d.properties.value) : "#eee",
            unifiedTooltip,
            widthMap, heightMap, codeSelection,
            code => setDepartement(code),
            reducedScale
        ));
        appendMapLegend(factorMapContainer, colorScaleFactor,
            [0, d3.max(combinedData, d => d[metric]) || 100],
            metricConfig.label + metricConfig.unit, d => Math.round(d) + metricConfig.unit);
    }

    // Fact box
    const summaryBox = buildImpactFactBox(codeSelection, combinedData, metric, metricConfigs);

    mapsContainer.appendChild(rendementMapContainer);
    mapsContainer.appendChild(factorMapContainer);
    mapsContainer.appendChild(summaryBox);
    container.appendChild(mapsContainer);

    // ── Bottom: scatterplot OR boxplot depending on metric ──
    const plotContainer = document.createElement("div");
    plotContainer.style.marginTop = "10px";

    if (metric === 'exposition') {
        // ── Boxplot grouped by cardinal direction ──
        const withCardinal = combinedData.map(d => ({
            ...d,
            cardinal: expositionToCardinalGroup(d.exposition)
        }));
        const order = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];

        const boxplot = Plot.plot({
            width, height: heightPlot,
            marginLeft: 60, marginTop: 30, grid: true,
            style: { background: "#fafafa", padding: "10px", borderRadius: "8px" },
            x: { label: "Direction d'exposition →", domain: order },
            y: { label: "↑ Rendement (hl/ha)", domain: [0, 150] },
            color: { scheme: "tableau10" },
            marks: [
                Plot.boxY(withCardinal, {
                    x: "cardinal", y: "rendement",
                    fill: "cardinal", opacity: 0.7
                }),
                Plot.dot(withCardinal, {
                    x: "cardinal", y: "rendement",
                    stroke: "#333",
                    fill: d => d.code === codeSelection ? "black" : "#aaa",
                    r:    d => d.code === codeSelection ? 5 : 3,
                    strokeWidth: d => d.code === codeSelection ? 2 : 0,
                    title: d => `${d.nom}\nExposition : ${Math.round(d.exposition)}° (${d.cardinal})\nRendement : ${Math.round(d.rendement)} hl/ha`
                }),
            ],
            caption: "Rendement selon l'orientation principale des vignobles. Chaque boîte représente la distribution des départements."
        });

        // Warning banner — no Pearson r for circular variable
        const banner = document.createElement("div");
        banner.style.cssText = `
            display:flex;align-items:flex-start;gap:16px;
            background:#fff8e1;border:1px solid #ffe082;border-radius:8px;
            padding:12px 16px;margin-top:16px;font-size:13px;color:#555;
            box-shadow:0 1px 4px rgba(0,0,0,0.06);
        `;
        banner.innerHTML = `
            <div style="line-height:1.6;">
                <div style="font-weight:bold;margin-bottom:4px;color:#333;">Variable circulaire — pas de corrélation linéaire</div>
                L'exposition est un angle (0°-360°) : 1° et 359° sont tous les deux "presque Nord" mais arithmétiquement à 358° d'écart.
                Un coefficient de Pearson n'a donc pas de sens ici.<br>
                Les vignobles orientés <strong>Sud (SE-SO)</strong> bénéficient d'un ensoleillement maximal dans l'hémisphère nord,
                mais le rendement brut peut être contrebalancé par d'autres facteurs (cépage, sol, altitude, pratiques culturales).
            </div>
        `;

        plotContainer.appendChild(boxplot);
        plotContainer.appendChild(banner);

    } else {
        // ── Scatterplot with regression + thresholds + Pearson r ──
        const r      = pearsonR(combinedData, metric, 'rendement');
        const rLabel = correlationLabel(r);

        // Linear regression slope for interpretation sentence
        const mx    = d3.mean(combinedData, d => d[metric]);
        const my    = d3.mean(combinedData, d => d.rendement);
        const slope = d3.sum(combinedData, d => (d[metric] - mx) * (d.rendement - my))
                    / d3.sum(combinedData, d => (d[metric] - mx) ** 2);

        const unitCfg = { soleil: "h/an", altitude: "m", pente: "%" }[metric];
        const nounCfg = { soleil: "d'ensoleillement", altitude: "d'altitude", pente: "de pente" }[metric];
        const effectSlope = metric === 'pente'
            ? Math.abs(slope).toFixed(2)
            : Math.abs(slope * 100).toFixed(1);
        const direction = slope > 0 ? "de plus" : "de moins";
        const interpretationText = metric === 'pente'
            ? `Par point de % de pente supplémentaire, le rendement varie de <strong>${effectSlope} hl/ha</strong> ${direction} (r = ${r.toFixed(2)}, corrélation ${rLabel.strength} ${rLabel.dir}).`
            : `Pour 100 ${unitCfg} ${nounCfg} supplémentaires, le rendement varie de <strong>${effectSlope} hl/ha</strong> ${direction} (r = ${r.toFixed(2)}, corrélation ${rLabel.strength} ${rLabel.dir}).`;

        // Threshold marks
        const thresholds     = metricThresholds[metric] || [];
        const thresholdMarks = thresholds.flatMap(t => [
            Plot.ruleX([t.value], { stroke: t.color, strokeWidth: 1.5, strokeDasharray: t.dash }),
            Plot.text([{ v: t.value, l: t.label }], {
                x: "v", y: 145,
                text: "l",
                fill: t.color, fontSize: 10, textAnchor: "middle", dy: -6
            })
        ]);

        const scatterplot = Plot.plot({
            width, height: heightPlot,
            marginLeft: 50, marginTop: 30, grid: true,
            style: { background: "#fafafa", padding: "10px", borderRadius: "8px" },
            x: { label: labels[metric] + " →" },
            y: { label: "↑ Rendement (hl/ha)", domain: [0, 150] },
            marks: [
                ...thresholdMarks,
                Plot.linearRegressionY(combinedData, {
                    x: metric, y: "rendement",
                    stroke: "#d32f2f", strokeWidth: 2, opacity: 0.6
                }),
                Plot.dot(combinedData, {
                    x: metric, y: "rendement",
                    fill: d => colorScaleRendement(d.rendement),
                    stroke: "#333",
                    strokeWidth: d => d.code === codeSelection ? 3 : 1,
                    r: d => Math.sqrt(d.surface) / 2,
                    title: d => `${d.nom}\n${labels[metric]} : ${Math.round(d[metric])}\nRendement : ${Math.round(d.rendement)} hl/ha\nSurface : ${Math.round(d.surface).toLocaleString()} ha`
                }),
                Plot.text(combinedData, {
                    x: metric, y: "rendement", text: "code", dy: -10,
                    fill: d => d.code === codeSelection ? "black" : "#555",
                    fontWeight: d => d.code === codeSelection ? "bold" : "normal",
                    filter: d => d.surface > 3000 || d.code === codeSelection
                })
            ],
        });

        // Correlation banner
        const banner = document.createElement("div");
        banner.style.cssText = `
            display:flex;align-items:flex-start;gap:16px;
            background:#fff;border:1px solid #ddd;border-radius:8px;
            padding:12px 16px;margin-top:16px;
            box-shadow:0 1px 4px rgba(0,0,0,0.06);font-size:13px;
        `;

        const rBadge = document.createElement("div");
        rBadge.style.cssText = `
            flex-shrink:0;text-align:center;border-radius:8px;
            padding:8px 14px;min-width:80px;color:#fff;
            background:${Math.abs(r) < 0.1 ? '#95a5a6' : Math.abs(r) < 0.3 ? '#e67e22' : '#c0392b'};
        `;
        rBadge.innerHTML = `
            <div style="font-size:20px;font-weight:bold;">r = ${r.toFixed(2)}</div>
            <div style="font-size:10px;margin-top:2px;opacity:0.9;">Corrélation<br>${rLabel.strength} ${rLabel.dir}</div>
        `;

        const rText = document.createElement("div");
        rText.style.cssText = "flex:1;line-height:1.6;color:#444;";
        rText.innerHTML = `
            <div style="font-weight:bold;margin-bottom:4px;color:#333;">Interprétation statistique</div>
            <div>${interpretationText}</div>
            ${thresholds.length > 0 ? `
            <div style="margin-top:8px;font-size:12px;color:#888;">
                <strong>Seuils de référence :</strong>
                ${thresholds.map(t =>
                    `<span style="color:${t.color};margin-right:12px;">▬ ${t.label} (${Math.round(t.value)} ${metricConfig.unit.trim()})</span>`
                ).join('')}
            </div>` : ''}
        `;

        banner.appendChild(rBadge);
        banner.appendChild(rText);

        plotContainer.appendChild(scatterplot);
        plotContainer.appendChild(banner);
    }

    container.appendChild(plotContainer);

    const dashboardContainer = document.getElementById('impact-dashboard');
    dashboardContainer.innerHTML = '';
    dashboardContainer.appendChild(container);
}

// ─── Exposition cardinal group helper ────────────────────────────────────────
function expositionToCardinalGroup(deg) {
    if (deg === null || deg === undefined) return "?";
    const d = ((deg % 360) + 360) % 360;
    const sectors = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    return sectors[Math.round(d / 45) % 8];
}


// ─── Impact fact box ──────────────────────────────────────────────────────────
function buildImpactFactBox(codeSelection, combinedData, activeMetric, metricConfigs) {
    const box = document.createElement("div");
    box.style.cssText = `
        flex:0 0 250px;
        background:#f8f9fa;border:1px solid #ddd;border-radius:8px;
        padding:12px 14px;box-sizing:border-box;
        display:flex;flex-direction:column;gap:8px;
        font-family:sans-serif;font-size:13px;color:#333;
        box-shadow:0 1px 4px rgba(0,0,0,0.06);
    `;

    if (!codeSelection) {
        box.innerHTML = `
            <div style="text-align:center;color:#aaa;padding:24px 0;">
                <div>Cliquez sur un département pour voir ses détails</div>
            </div>`;
        return box;
    }

    const d = combinedData.find(c => c.code === codeSelection);
    if (!d) {
        box.innerHTML = `<div style="text-align:center;color:#aaa;padding:16px 0;">Données indisponibles</div>`;
        return box;
    }

    // Build rank for each metric
    const metrics = [
        { key: 'rendement', label: 'Rendement',      unit: 'hl/ha', fmt: v => Math.round(v) + ' hl/ha',  color: '#1976d2' },
        { key: 'soleil',    label: 'Ensoleillement', unit: 'h/an',  fmt: v => Math.round(v) + ' h/an',    color: '#f39c12' },
        { key: 'altitude',  label: 'Altitude',       unit: 'm',     fmt: v => Math.round(v) + ' m',        color: '#5d7a8a' },
        { key: 'pente',     label: 'Pente',          unit: '%',     fmt: v => v.toFixed(1) + '%',          color: '#c0392b' },
        { key: 'exposition',label: 'Exposition',     unit: '°',     fmt: v => Math.round(v) + '° (' + expositionToCardinal(v) + ')', color: '#8e6b3e' },
        { key: 'surface',   label: 'Surface viticole', unit: 'ha',  fmt: v => Math.round(v).toLocaleString() + ' ha', color: '#27ae60' },
    ];

    const rankOf = (key) => {
        const sorted = [...combinedData].filter(r => r[key] > 0).sort((a, b) => d3.descending(a[key], b[key]));
        const r = sorted.findIndex(r => r.code === codeSelection) + 1;
        return r > 0 ? `${r}<sup>e</sup> / ${sorted.length}` : '—';
    };

    const rowsHTML = metrics.map(m => {
        const val = d[m.key];
        const isActive = m.key === activeMetric;
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:5px 6px;border-radius:4px;
                    background:${isActive ? 'rgba(128,0,32,0.08)' : 'transparent'};
                    border-left:3px solid ${isActive ? '#800020' : 'transparent'};">
            <div>
                <div style="font-size:11px;color:#888;">${m.label}</div>
                <div style="font-weight:bold;font-size:13px;color:${m.color};">${val != null && val > 0 ? m.fmt(val) : '—'}</div>
            </div>
            <div style="font-size:10px;color:#aaa;text-align:right;background:#e9ecef;
                        padding:2px 5px;border-radius:3px;white-space:nowrap;">
                ${val > 0 ? rankOf(m.key) : '—'}
            </div>
        </div>`;
    }).join('');

    box.innerHTML = `
        <div style="font-weight:bold;font-size:14px;color:#800020;border-bottom:1px solid #e0e0e0;padding-bottom:6px;">
            ${d.nom} <span style="font-size:11px;color:#888;font-weight:normal;">(${d.code})</span>
        </div>
        <div style="font-size:10px;color:#aaa;font-style:italic;margin-bottom:2px;">
            Indicateur actif : <strong style="color:#800020;">${metricConfigs[activeMetric].label}</strong>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;">
            ${rowsHTML}
        </div>
    `;

    return box;
}

// ─── Vue Synthèse ─────────────────────────────────────────────────────────────
function renderSyntheseDashboard() {
    if (!dataProd || !dataSoleil || !dataTopo || !departments) {
        document.getElementById('synthese-dashboard').innerHTML = '<div class="loading">Chargement...</div>';
        return;
    }

    const codeSelection = departementSelectionne;
    const W = 420, H = 380, gap = 20;

    const container = document.getElementById('synthese-dashboard');
    container.innerHTML = '';

    // ── topoMap ──
    const topoMap = new Map(dataTopo.map(d => [String(d.code_dep).padStart(2, '0'), d]));

    // ── Unified data map: code → all indicators ──
    const allDataMap = new Map();
    dataProd.forEach(d => {
        const code      = String(d.code_dept).padStart(2, '0');
        const surface   = d.surf_totale || 0;
        const prod      = d[choixVin]   || 0;
        const rendement = surface > 20 ? prod / surface : 0;
        const sunData   = dataSoleil.find(s => String(s.code_dept).padStart(2, '0') === code);
        const topoData  = topoMap.get(code);
        allDataMap.set(code, {
            nom:        d.nom_dept,
            production: prod,
            rendement,
            surface,
            soleil:     sunData  ? sunData.heures_soleil : null,
            altitude:   topoData ? topoData.altitude     : null,
            pente:      topoData ? topoData.pente        : null,
            exposition: topoData ? topoData.exposition   : null,
        });
    });

    // ── Unified tooltip showing all indicators ──
    const unifiedTooltip = f => {
        const d = allDataMap.get(f.properties.code);
        if (!d) return `<strong>${f.properties.nom}</strong><br><em>Données indisponibles</em>`;
        return `
            <strong>${d.nom}</strong>
            <hr style="margin:4px 0;border:none;border-top:1px solid #ddd;">
            Production : <strong>${d.production > 0 ? Math.round(d.production).toLocaleString() + ' hl' : '—'}</strong><br>
            Rendement : <strong>${d.rendement  > 0 ? Math.round(d.rendement)  + ' hl/ha' : '—'}</strong><br>
            Ensoleillement : <strong>${d.soleil    != null ? Math.round(d.soleil)    + ' h/an' : '—'}</strong><br>
            Altitude : <strong>${d.altitude  != null ? Math.round(d.altitude)  + ' m'    : '—'}</strong><br>
            Pente : <strong>${d.pente     != null ? d.pente.toFixed(1)         + '%'     : '—'}</strong><br>
            Exposition : <strong>${d.exposition != null ? Math.round(d.exposition) + '° (' + expositionToCardinal(d.exposition) + ')' : '—'}</strong>
        `;
    };

    // ── Helper: build one card ──
    function buildSyntheseCard(cardTitle, mapFeatures, colorFn, colorScale, legendDomain, legendLabel, legendFmt) {
        const card = document.createElement("div");
        card.style.cssText = `
            background:#fff;border:1px solid #ddd;border-radius:8px;
            padding:12px;box-shadow:0 1px 4px rgba(0,0,0,0.07);
            display:flex;flex-direction:column;gap:6px;
        `;

        const titleEl = document.createElement("div");
        titleEl.textContent = cardTitle;
        titleEl.style.cssText = "font-weight:bold;font-size:13px;color:#5c131e;border-bottom:1px solid #f0e0e0;padding-bottom:6px;";
        card.appendChild(titleEl);

        const mapEl = buildChoroplethMap(
            mapFeatures, colorFn, unifiedTooltip,
            W, H, codeSelection,
            code => setDepartement(code),
            1800
        );
        card.appendChild(mapEl);

        const legendWrapper = document.createElement("div");
        appendMapLegend(legendWrapper, colorScale, legendDomain, legendLabel, legendFmt);
        card.appendChild(legendWrapper);

        return card;
    }

    // ── 1. Production ──
    const metricProd = choixVin;
    const theme      = wineThemes[metricProd];
    const maxProd    = d3.max(dataProd, d => d[metricProd]) || 10000;
    const colorProd  = d3.scaleSequential([0, maxProd], theme.scale);

    const geojsonProd = JSON.parse(JSON.stringify(departments));
    geojsonProd.features.forEach(f => {
        const row = dataProd.find(d => String(d.code_dept).padStart(2, '0') === f.properties.code);
        f.properties.value = row ? row[metricProd] : 0;
    });

    const cardProd = buildSyntheseCard(
        theme.label,
        geojsonProd.features,
        d => d.properties.value > 0 ? colorProd(d.properties.value) : "#eee",
        colorProd, [0, maxProd], theme.label + " (hl)",
        d => (d / 1000).toFixed(0) + "k"
    );

    // ── 2. Rendement ──
    const rendData = dataProd.map(d => {
        const code      = String(d.code_dept).padStart(2, '0');
        const surface   = d.surf_totale || 0;
        const production = d[choixVin]  || 0;
        const rendement = surface > 20 ? production / surface : 0;
        return { code, nom_dept: d.nom_dept, rendement };
    }).filter(d => d.rendement > 0);

    const maxRend   = d3.max(rendData, d => d.rendement) || 100;
    const colorRend = d3.scaleSequential([0, maxRend], d3.interpolateYlGnBu);

    const geojsonRend = JSON.parse(JSON.stringify(departments));
    geojsonRend.features.forEach(f => {
        const row = rendData.find(d => d.code === f.properties.code);
        f.properties.value = row ? row.rendement : 0;
    });

    const cardRend = buildSyntheseCard(
        "Rendement",
        geojsonRend.features,
        d => d.properties.value > 0 ? colorRend(d.properties.value) : "#eee",
        colorRend, [0, maxRend], "Rendement (hl/ha)",
        d => Math.round(d) + " hl/ha"
    );

    // ── 3. Ensoleillement ──
    const maxSoleil   = d3.max(dataSoleil, d => d.heures_soleil) || 3000;
    const colorSoleil = d3.scaleSequential([0, maxSoleil], d3.interpolateYlOrRd);

    const geojsonSoleil = JSON.parse(JSON.stringify(departments));
    geojsonSoleil.features.forEach(f => {
        const row = dataSoleil.find(d => String(d.code_dept).padStart(2, '0') === f.properties.code);
        f.properties.value = row ? row.heures_soleil : 0;
    });

    const cardSoleil = buildSyntheseCard(
        "Ensoleillement",
        geojsonSoleil.features,
        d => d.properties.value > 0 ? colorSoleil(d.properties.value) : "#eee",
        colorSoleil, [0, maxSoleil], "Ensoleillement (h/an)",
        d => Math.round(d) + "h"
    );

    // ── 4. Altitude ──
    const maxAlt   = d3.max(dataTopo, d => d.altitude) || 500;
    const colorAlt = d3.scaleSequential([0, maxAlt], d3.interpolateGnBu);

    const geojsonAlt = JSON.parse(JSON.stringify(departments));
    geojsonAlt.features.forEach(f => {
        const row = topoMap.get(f.properties.code);
        f.properties.value = row ? row.altitude : 0;
    });

    const cardAlt = buildSyntheseCard(
        "Altitude moyenne",
        geojsonAlt.features,
        d => d.properties.value > 0 ? colorAlt(d.properties.value) : "#eee",
        colorAlt, [0, maxAlt], "Altitude (m)",
        d => Math.round(d) + "m"
    );

    // ── 5. Pente ──
    const maxPente   = d3.max(dataTopo, d => d.pente) || 15;
    const colorPente = d3.scaleSequential([0, maxPente], d3.interpolateReds);

    const geojsonPente = JSON.parse(JSON.stringify(departments));
    geojsonPente.features.forEach(f => {
        const row = topoMap.get(f.properties.code);
        f.properties.value = row ? row.pente : 0;
    });

    const cardPente = buildSyntheseCard(
        "Pente moyenne",
        geojsonPente.features,
        d => d.properties.value > 0 ? colorPente(d.properties.value) : "#eee",
        colorPente, [0, maxPente], "Pente (%)",
        d => d.toFixed(1) + "%"
    );

    // ── 6. Exposition ──
    const maxExpo   = 360;
    const colorExpo = d3.scaleSequential([0, maxExpo], d3.interpolateYlOrBr);

    const geojsonExpo = JSON.parse(JSON.stringify(departments));
    geojsonExpo.features.forEach(f => {
        const row = topoMap.get(f.properties.code);
        f.properties.value = row ? row.exposition : 0;
    });

    const cardExpo = buildSyntheseCard(
        "Exposition moyenne",
        geojsonExpo.features,
        d => d.properties.value > 0 ? colorExpo(d.properties.value) : "#eee",
        colorExpo, [0, maxExpo], "Exposition (°)",
        d => Math.round(d) + "°"
    );

    // ── Grid ──
    const grid = document.createElement("div");
    grid.style.cssText = `
        display:grid;
        grid-template-columns:${W}px ${W}px ${W}px;
        gap:${gap}px;
        align-items:start;
    `;

    grid.appendChild(cardProd);
    grid.appendChild(cardRend);
    grid.appendChild(cardSoleil);
    grid.appendChild(cardAlt);
    grid.appendChild(cardPente);
    grid.appendChild(cardExpo);

    container.appendChild(grid);
}

// ─── Fact box builder ─────────────────────────────────────────────────────────
/**
 * Builds a small info card for the selected department.
 * @param {string}   codeSelection
 * @param {object[]} data          - must have .code and .[metric]
 * @param {string}   metric
 * @param {function} colorScale
 * @param {string}   unit
 * @param {function} formatFn      - d => string shown as "value"
 * @param {string}   accentColor
 */

function buildFactBox(codeSelection, data, metric, colorScale, unit, formatFn, accentColor = "#1976d2") {
    const box = document.createElement("div");
    box.style.cssText = `
        background:#f8f9fa;border:1px solid #ddd;border-radius:8px;
        padding:12px 14px;box-sizing:border-box;width:100%;
        display:flex;flex-direction:column;gap:8px;
        font-family:sans-serif;font-size:13px;color:#333;
        box-shadow:0 1px 4px rgba(0,0,0,0.06);
    `;

    if (!codeSelection) {
        box.innerHTML = `
            <div style="text-align:center;color:#aaa;padding:16px 0;">
                <div>Cliquez sur un département pour voir ses détails</div>
            </div>`;
        return box;
    }

    const d = data.find(r => r.code === codeSelection || String(r.code_dept).padStart(2,'0') === codeSelection);
    if (!d) {
        box.innerHTML = `<div style="text-align:center;color:#aaa;padding:16px 0;">Données indisponibles</div>`;
        return box;
    }

    const sorted   = [...data].filter(r => r[metric] > 0).sort((a, b) => d3.descending(a[metric], b[metric]));
    const rank     = sorted.findIndex(r => (r.code || String(r.code_dept).padStart(2,'0')) === codeSelection) + 1;
    const total    = sorted.length;
    const val      = d[metric];
    const valColor = colorScale(val);
    const nom      = d.nom_dept || d.nom || codeSelection;
    const aopList  = dataAop[codeSelection] || [];

    box.innerHTML = `
        <div style="font-weight:bold;font-size:14px;color:${accentColor};border-bottom:1px solid #e0e0e0;padding-bottom:6px;">
            ${nom} <span style="font-size:11px;color:#888;font-weight:normal;">(${codeSelection})</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:12px;height:12px;border-radius:50%;background:${valColor};flex-shrink:0;border:1px solid #ccc;"></div>
            <span style="font-size:20px;font-weight:bold;">${formatFn(d)}</span>
            <span style="font-size:11px;color:#888;">${unit}</span>
        </div>
        <div style="background:#e9ecef;border-radius:4px;padding:4px 8px;font-size:12px;">
            Classé <strong>${rank}<sup>e</sup></strong> / ${total} départements
        </div>
        ${aopList.length > 0 ? `
        <div style="font-size:11px;color:#666;border-top:1px dashed #ddd;padding-top:6px;">
            <div style="font-weight:600;margin-bottom:3px;">Principales AOP :</div>
            <ul style="margin:0;padding-left:14px;line-height:1.6;">
                ${aopList.slice(0, 4).map(a => `<li>${a}</li>`).join('')}
                ${aopList.length > 4 ? `<li style="color:#bbb;font-style:italic;">+ ${aopList.length - 4} autres</li>` : ''}
            </ul>
        </div>` : '<div style="font-size:11px;color:#bbb;font-style:italic;">Aucune AOP répertoriée</div>'}
    `;

    return box;
}

// ─── Event listeners ──────────────────────────────────────────────────────────
document.getElementById('wineTypeGlobal').addEventListener('change', e => {
    choixVin = e.target.value;
    rerenderAllRenderedTabs();
});

document.getElementById('prodType').addEventListener('change', e => {
    choixProd = e.target.value;
    renderProductionDashboard();
});

document.getElementById('caracType').addEventListener('change', e => {
    choixCarac = e.target.value;
    renderCaracDashboard();
});

document.getElementById('impactFactor').addEventListener('change', e => {
    facteurX = e.target.value;
    renderImpactDashboard();
});

loadData();