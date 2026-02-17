// Global variables
let dataProd = null;
let dataSoleil = null;
let dataTopo = null;
let combinedData = [];
let filteredData = [];
let currentPage = 1;
let rowsPerPage = 25;
let currentSort = { column: null, ascending: true };
let productionSort = { column: 'total_prod', ascending: false };
let sunshineSort = { column: 'heures_soleil', ascending: false };
let topoSort = { column: 'altitude', ascending: false };

// Load all data
async function loadData() {
    try {
        const [prodData, sunData, topoData] = await Promise.all([
            d3.csv("data/processed/production_vins_2024_clean.csv", d3.autoType),
            d3.csv("data/processed/ensoleillement_france_2024.csv", d3.autoType),
            d3.csv("data/processed/topo_par_departement.csv", d3.autoType),
        ]);

        dataProd = prodData;
        dataSoleil = sunData;
        dataTopo = topoData;

        // Combine all data
        const topoMap = new Map(dataTopo.map(d => [String(d.code_dep).padStart(2, '0'), d]));
        const sunMap = new Map(dataSoleil.map(d => [String(d.code_dept).padStart(2, '0'), d]));

        combinedData = dataProd.map(d => {
            const code = String(d.code_dept).padStart(2, '0');
            const sunData = sunMap.get(code);
            const topoData = topoMap.get(code);
            
            const surface = d.surf_totale || 0;
            const production = d.total_prod || 0;
            const rendement = surface > 0 ? (production / surface) : 0;

            return {
                code: code,
                nom: d.nom_dept,
                total_prod: d.total_prod || 0,
                total_rouge: d.total_rouge || 0,
                total_blanc: d.total_blanc || 0,
                total_rose: d.total_rose || 0,
                surf_totale: surface,
                surf_aop: d.surf_aop || 0,
                surf_igp: d.surf_igp || 0,
                nb_declarations: d.nb_declarations || 0,
                rendement: rendement,
                soleil: sunData ? sunData.heures_soleil : 0,
                altitude: topoData ? topoData.altitude : 0,
                pente: topoData ? topoData.pente : 0,
                exposition: topoData ? topoData.exposition : 0,
                nb_parcelles_vignes: topoData ? topoData.nb_parcelles_vignes : 0
            };
        });

        filteredData = [...combinedData];
        
        renderStatsSummary();
        renderCombinedTable();
        renderProductionTable();
        renderSunshineTable();
        renderTopoTable();
        
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('tableBody').innerHTML = 
            `<tr><td colspan="13" style="color: red; text-align: center;">Erreur de chargement : ${error.message}</td></tr>`;
    }
}

// Render statistics summary
function renderStatsSummary() {
    const totalProduction = d3.sum(combinedData, d => d.total_prod);
    const totalSurface = d3.sum(combinedData, d => d.surf_totale);
    const avgRendement = d3.mean(combinedData.filter(d => d.rendement > 0), d => d.rendement);
    const avgSoleil = d3.mean(combinedData.filter(d => d.soleil > 0), d => d.soleil);
    const nbDepartements = combinedData.length;
    const totalDeclarations = d3.sum(combinedData, d => d.nb_declarations);

    const html = `
        <div class="stats-grid">
            <div class="stat-card">
                <h3>Départements</h3>
                <div class="value">${nbDepartements}</div>
            </div>
            <div class="stat-card">
                <h3>Production Totale</h3>
                <div class="value">${(totalProduction / 1000000).toFixed(2)}<span class="unit">M hl</span></div>
            </div>
            <div class="stat-card">
                <h3>Surface Totale</h3>
                <div class="value">${(totalSurface / 1000).toFixed(0)}<span class="unit">k ha</span></div>
            </div>
            <div class="stat-card">
                <h3>Rendement Moyen</h3>
                <div class="value">${avgRendement.toFixed(1)}<span class="unit">hl/ha</span></div>
            </div>
            <div class="stat-card">
                <h3>Ensoleillement Moyen</h3>
                <div class="value">${Math.round(avgSoleil)}<span class="unit">h/an</span></div>
            </div>
            <div class="stat-card">
                <h3>Déclarations Totales</h3>
                <div class="value">${totalDeclarations.toLocaleString()}</div>
            </div>
        </div>
    `;

    document.getElementById('stats-summary').innerHTML = html;
}

// Render combined table
function renderCombinedTable() {
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageData = filteredData.slice(start, end);

    const tbody = document.getElementById('tableBody');
    
    if (pageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" style="text-align: center; color: #666;">Aucune donnée à afficher</td></tr>';
        return;
    }

    tbody.innerHTML = pageData.map(d => `
        <tr>
            <td><strong>${d.code}</strong></td>
            <td>${d.nom}</td>
            <td class="num-right">${d.total_prod.toLocaleString()}</td>
            <td class="num-right">${d.total_rouge.toLocaleString()}</td>
            <td class="num-right">${d.total_blanc.toLocaleString()}</td>
            <td class="num-right">${d.total_rose.toLocaleString()}</td>
            <td class="num-right">${d.surf_totale.toLocaleString()}</td>
            <td class="num-right">${d.nb_declarations.toLocaleString()}</td>
            <td class="num-right">${d.rendement.toFixed(1)}</td>
            <td class="num-right">${d.soleil.toLocaleString()}</td>
            <td class="num-right">${Math.round(d.altitude)}</td>
            <td class="num-right">${d.pente.toFixed(1)}</td>
            <td class="num-right">${Math.round(d.exposition)}</td>
        </tr>
    `).join('');

    updatePagination();
}

// Render production table
function renderProductionTable() {
    const tbody = document.getElementById('productionTableBody');
    const sorted = [...dataProd].sort((a, b) => 
        productionSort.ascending ? 
            d3.ascending(a[productionSort.column], b[productionSort.column]) :
            d3.descending(a[productionSort.column], b[productionSort.column])
    );
    
    tbody.innerHTML = sorted.map(d => `
        <tr>
            <td><strong>${String(d.code_dept).padStart(2, '0')}</strong></td>
            <td>${d.nom_dept}</td>
            <td class="num-right">${(d.total_prod || 0).toLocaleString()}</td>
            <td class="num-right">${(d.total_rouge || 0).toLocaleString()}</td>
            <td class="num-right">${(d.total_blanc || 0).toLocaleString()}</td>
            <td class="num-right">${(d.total_rose || 0).toLocaleString()}</td>
            <td class="num-right">${(d.surf_totale || 0).toLocaleString()}</td>
            <td class="num-right">${(d.surf_aop || 0).toLocaleString()}</td>
            <td class="num-right">${(d.surf_igp || 0).toLocaleString()}</td>
            <td class="num-right">${(d.nb_declarations || 0).toLocaleString()}</td>
        </tr>
    `).join('');
}

// Render sunshine table
function renderSunshineTable() {
    const tbody = document.getElementById('sunshineTableBody');
    const sorted = [...dataSoleil].sort((a, b) => 
        sunshineSort.ascending ?
            d3.ascending(a[sunshineSort.column], b[sunshineSort.column]) :
            d3.descending(a[sunshineSort.column], b[sunshineSort.column])
    );
    
    tbody.innerHTML = sorted.map(d => `
        <tr>
            <td><strong>${String(d.code_dept).padStart(2, '0')}</strong></td>
            <td>${d.nom_dept}</td>
            <td class="num-right">${(d.heures_soleil || 0).toLocaleString()}</td>
        </tr>
    `).join('');
}

// Render topography table
function renderTopoTable() {
    const tbody = document.getElementById('topoTableBody');
    const sorted = [...dataTopo].sort((a, b) => 
        topoSort.ascending ?
            d3.ascending(a[topoSort.column], b[topoSort.column]) :
            d3.descending(a[topoSort.column], b[topoSort.column])
    );
    
    tbody.innerHTML = sorted.map(d => `
        <tr>
            <td><strong>${String(d.code_dep).padStart(2, '0')}</strong></td>
            <td class="num-right">${Math.round(d.altitude || 0)}</td>
            <td class="num-right">${(d.pente || 0).toFixed(2)}</td>
            <td class="num-right">${Math.round(d.exposition || 0)}</td>
            <td class="num-right">${(d.nb_parcelles_vignes || 0).toLocaleString()}</td>
        </tr>
    `).join('');
}

// Apply filters
function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const minProd = parseFloat(document.getElementById('filterProduction').value) || 0;
    const minSun = parseFloat(document.getElementById('filterSunshine').value) || 0;
    const minSurface = parseFloat(document.getElementById('filterSurface').value) || 0;

    filteredData = combinedData.filter(d => {
        const matchesSearch = d.nom.toLowerCase().includes(searchTerm) || d.code.includes(searchTerm);
        const matchesProd = d.total_prod >= minProd;
        const matchesSun = d.soleil >= minSun;
        const matchesSurface = d.surf_totale >= minSurface;
        
        return matchesSearch && matchesProd && matchesSun && matchesSurface;
    });

    currentPage = 1;
    renderCombinedTable();
}

// Reset filters
function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterProduction').value = '';
    document.getElementById('filterSunshine').value = '';
    document.getElementById('filterSurface').value = '';
    filteredData = [...combinedData];
    currentPage = 1;
    renderCombinedTable();
}

// Sort table
function sortTable(column) {
    if (currentSort.column === column) {
        currentSort.ascending = !currentSort.ascending;
    } else {
        currentSort.column = column;
        currentSort.ascending = false;
    }

    filteredData.sort((a, b) => {
        const aVal = a[column];
        const bVal = b[column];
        return currentSort.ascending ? 
            (aVal < bVal ? -1 : aVal > bVal ? 1 : 0) :
            (aVal > bVal ? -1 : aVal < bVal ? 1 : 0);
    });

    // Update header
    document.querySelectorAll('#dataTable th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
    });
    
    const headers = document.querySelectorAll('#dataTable th');
    headers.forEach(th => {
        if (th.onclick && th.onclick.toString().includes(`'${column}'`)) {
            th.className = currentSort.ascending ? 'sorted-asc num-right' : 'sorted-desc num-right';
        }
    });

    renderCombinedTable();
}

// Sort production table
function sortProductionTable(column) {
    if (productionSort.column === column) {
        productionSort.ascending = !productionSort.ascending;
    } else {
        productionSort.column = column;
        productionSort.ascending = false;
    }
    renderProductionTable();
}

// Sort sunshine table
function sortSunshineTable(column) {
    if (sunshineSort.column === column) {
        sunshineSort.ascending = !sunshineSort.ascending;
    } else {
        sunshineSort.column = column;
        sunshineSort.ascending = false;
    }
    renderSunshineTable();
}

// Sort topo table
function sortTopoTable(column) {
    if (topoSort.column === column) {
        topoSort.ascending = !topoSort.ascending;
    } else {
        topoSort.column = column;
        topoSort.ascending = false;
    }
    renderTopoTable();
}

// Pagination
function updatePagination() {
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    document.getElementById('pageInfo').textContent = 
        `Page ${currentPage} / ${totalPages} (${filteredData.length} départements)`;
}

function nextPage() {
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        renderCombinedTable();
    }
}

function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        renderCombinedTable();
    }
}

function changeRowsPerPage() {
    rowsPerPage = parseInt(document.getElementById('rowsPerPageSelect').value);
    currentPage = 1;
    renderCombinedTable();
}

// Export to CSV
function exportToCSV() {
    const headers = ['Code', 'Département', 'Prod. Totale (hl)', 'Rouge (hl)', 'Blanc (hl)', 
                   'Rosé (hl)', 'Surface (ha)', 'Déclarations', 'Rendement (hl/ha)', 'Soleil (h/an)', 
                   'Altitude (m)', 'Pente (%)', 'Exposition (°)'];
    
    const rows = filteredData.map(d => [
        d.code, d.nom, d.total_prod, d.total_rouge, d.total_blanc, d.total_rose,
        d.surf_totale, d.nb_declarations, d.rendement.toFixed(2), d.soleil, 
        Math.round(d.altitude), d.pente.toFixed(2), Math.round(d.exposition)
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `donnees_vins_geographie_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Add search on Enter key
document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') applyFilters();
});

// Load data on page load
loadData();