// State Management
let diasTranscurridos = 20;
const totalDiasMes = 31;
let simulationSpeed = 1.0;
let projectionType = 'linear';
let selectedClient = null;
let appData = null;
let performanceChart = null;

// Collapsed state of portfolios (true = collapsed, false = expanded)
const collapsedPortfolios = {
  'BRADESCO': false,
  'INVEX': false,
  'CAJA_MORELIA_VALLADOLID': false
};

// Search & Filter state
let currentFilter = 'all';
let searchQuery = '';

// Currency and Percentage Formatters
const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2
});

const percentFormatter = new Intl.NumberFormat('es-MX', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatCurrency(val) {
  return currencyFormatter.format(val);
}

function formatPercent(val) {
  // Convert 108.27 to 1.0827 for percent formatter
  return percentFormatter.format(val / 100);
}

// DOM Elements
const dbStatusBadge = document.getElementById('db-status-badge');
const currentDateText = document.getElementById('current-date-text');

const globalMetaEl = document.getElementById('global-meta');
const globalAvanceEl = document.getElementById('global-avance');
const globalProgressBar = document.getElementById('global-progress-bar');
const globalPctLogroEl = document.getElementById('global-pct-logro');

const globalProyeccionEl = document.getElementById('global-proyeccion');
const globalProjectionBar = document.getElementById('global-projection-bar');
const globalPctAlcanceEl = document.getElementById('global-pct-alcance');

const globalDeficitEl = document.getElementById('global-deficit');
const globalDeficitDescEl = document.getElementById('global-deficit-desc');

const tableBody = document.getElementById('table-body');
const tableFooterRow = document.getElementById('table-footer-row');
const leaderboardList = document.getElementById('leaderboard-list');
const tariffDetailContainer = document.getElementById('tariff-detail-container');

// Controls
const searchInput = document.getElementById('client-search');
const filterButtons = document.querySelectorAll('.filter-btn');

// Simulator Controls
const simProjectionType = document.getElementById('sim-projection-type');
const simDaysSlider = document.getElementById('sim-days-slider');
const simDaysVal = document.getElementById('sim-days-val');
const simSpeedSlider = document.getElementById('sim-speed-slider');
const simSpeedVal = document.getElementById('sim-speed-val');
const resetSimBtn = document.getElementById('reset-sim-btn');

// Debounce timer for sliders
let fetchTimeout = null;
function debouncedFetch() {
  clearTimeout(fetchTimeout);
  fetchTimeout = setTimeout(fetchDashboardData, 150);
}

// Fetch dashboard data from API
async function fetchDashboardData() {
  try {
    const url = `/api/dashboard?diasTranscurridos=${diasTranscurridos}&totalDiasMes=${totalDiasMes}&simulationSpeed=${simulationSpeed}&projectionType=${projectionType}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('API response failed');
    
    appData = await response.json();
    updateUI();
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    tableBody.innerHTML = `<tr><td colspan="10" class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Error al conectar con el servidor.</td></tr>`;
  }
}

// Update entire UI using appData
function updateUI() {
  if (!appData) return;
  
  // 1. Update Connection Status Badge
  if (appData.isDemoMode) {
    dbStatusBadge.className = 'status-badge demo';
    dbStatusBadge.querySelector('.status-text').textContent = 'Modo Demo';
    dbStatusBadge.setAttribute('title', 'MySQL no conectado. Usando datos simulados.');
  } else {
    dbStatusBadge.className = 'status-badge mysql';
    dbStatusBadge.querySelector('.status-text').textContent = 'MySQL Conectado';
    dbStatusBadge.setAttribute('title', 'Conectado a la base de datos MySQL.');
  }
  
  // Update Date Badge with days transcurred
  currentDateText.textContent = `Julio 2026 (Día ${diasTranscurridos}/${totalDiasMes})`;
  
  // 2. Update Global Stats Summary Cards
  const sum = appData.summary;
  globalMetaEl.textContent = formatCurrency(sum.meta);
  globalAvanceEl.textContent = formatCurrency(sum.avance);
  globalPctLogroEl.textContent = `${sum.pctLogro}% logrado`;
  globalProgressBar.style.width = `${Math.min(100, sum.pctLogro)}%`;
  
  globalProyeccionEl.textContent = formatCurrency(sum.proyeccion);
  globalPctAlcanceEl.textContent = `${sum.alcance}% alcance proyectado`;
  globalProjectionBar.style.width = `${Math.min(100, sum.alcance)}%`;
  
  globalDeficitEl.textContent = formatCurrency(sum.deficit);
  if (sum.deficit >= 0) {
    globalDeficitEl.className = 'stat-value text-success';
    globalDeficitDescEl.innerHTML = `<span style="color: var(--success)"><i class="fa-solid fa-chevron-up"></i> Superávit de ${formatCurrency(sum.deficit)}</span>`;
  } else {
    globalDeficitEl.className = 'stat-value text-danger';
    globalDeficitDescEl.innerHTML = `<span style="color: var(--danger)"><i class="fa-solid fa-chevron-down"></i> Déficit de ${formatCurrency(Math.abs(sum.deficit))}</span>`;
  }
  
  // 3. Render Tree Table
  renderTreeTable();
  
  // 4. Render Leaderboard
  renderLeaderboard();
  
  // 5. Update Tariff Detail Widget (if client selected)
  updateTariffWidget();
  
  // 6. Update Performance Chart
  updateChartData();
}

// Render the tree table with expand/collapse and filter
function renderTreeTable() {
  tableBody.innerHTML = '';
  
  appData.portfolios.forEach(port => {
    // Check if this portfolio matches the current filter
    if (currentFilter !== 'all' && port.nombre !== currentFilter) {
      return;
    }
    
    // Filter child clients based on search query
    const filteredClients = port.clientes.filter(client => 
      client.cliente.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    // If we are searching and this portfolio has no matching clients, don't render it at all
    if (searchQuery !== '' && filteredClients.length === 0) {
      return;
    }
    
    const isCollapsed = collapsedPortfolios[port.nombre];
    
    // Render Portfolio Group Header Row
    const portHeader = document.createElement('tr');
    portHeader.className = `group-row ${port.nombre}-header`;
    portHeader.innerHTML = `
      <td class="col-expand-toggle text-center" onclick="togglePortfolio('${port.nombre}')">
        <i class="fa-solid fa-chevron-down arrow-icon"></i>
      </td>
      <td class="text-left" onclick="togglePortfolio('${port.nombre}')">
        ${port.nombre.replace(/_/g, ' ')}
      </td>
      <td class="text-right">${formatCurrency(port.meta)}</td>
      <td class="text-right">${formatCurrency(port.avance)}</td>
      <td class="text-center">-</td>
      <td class="text-right" style="color: ${port.pctLogro >= 100 ? 'var(--success)' : port.pctLogro >= 80 ? 'var(--warning)' : 'var(--danger)'}">
        ${port.pctLogro}%
      </td>
      <td class="text-right">${formatCurrency(port.promDiario)}</td>
      <td class="text-right">${formatCurrency(port.proyeccion)}</td>
      <td class="text-right">${port.alcance}%</td>
      <td class="text-right" style="color: ${port.deficit >= 0 ? 'var(--success)' : 'var(--danger)'}">
        ${port.deficit >= 0 ? '+' : ''}${formatCurrency(port.deficit)}
      </td>
    `;
    
    if (isCollapsed) {
      portHeader.classList.add('collapsed');
    }
    tableBody.appendChild(portHeader);
    
    // Render Child Client Rows
    filteredClients.forEach(client => {
      const clientRow = document.createElement('tr');
      clientRow.className = `child-row ${isCollapsed ? 'hidden' : ''}`;
      if (selectedClient && selectedClient.cliente === client.cliente) {
        clientRow.classList.add('selected');
      }
      
      // Setup Click listener to select client
      clientRow.addEventListener('click', () => {
        // Toggle selection
        if (selectedClient && selectedClient.cliente === client.cliente) {
          selectedClient = null;
          document.querySelectorAll('.child-row').forEach(r => r.classList.remove('selected'));
        } else {
          selectedClient = client;
          document.querySelectorAll('.child-row').forEach(r => r.classList.remove('selected'));
          clientRow.classList.add('selected');
        }
        updateTariffWidget();
      });
      
      // Semáforo Badge HTML
      let statusBadgeHtml = '';
      if (client.semaforo === 'green') {
        statusBadgeHtml = `<span class="shape-indicator circle" title="Cumplido (≥100%)"></span>`;
      } else if (client.semaforo === 'orange') {
        statusBadgeHtml = `<span class="shape-indicator triangle" title="Cerca (80% - 99.9%)"></span>`;
      } else {
        statusBadgeHtml = `<span class="shape-indicator diamond" title="Alerta (<80%)"></span>`;
      }
      
      clientRow.innerHTML = `
        <td class="text-center text-muted"><span style="font-size: 0.65rem;">#${client.posicion}</span></td>
        <td class="text-left client-name-cell">${client.cliente}</td>
        <td class="text-right text-muted">${formatCurrency(client.meta)}</td>
        <td class="text-right">${formatCurrency(client.avance)}</td>
        <td class="text-center status-badge-cell">${statusBadgeHtml}</td>
        <td class="text-right" style="font-weight: 500">${client.pctLogro}%</td>
        <td class="text-right text-muted">${formatCurrency(client.promDiario)}</td>
        <td class="text-right">${formatCurrency(client.proyeccion)}</td>
        <td class="text-right">${client.alcance}%</td>
        <td class="text-right" style="color: ${client.deficit >= 0 ? 'var(--success)' : 'var(--danger)'}">
          ${client.deficit >= 0 ? '+' : ''}${formatCurrency(client.deficit)}
        </td>
      `;
      
      tableBody.appendChild(clientRow);
    });
  });
  
  // Render Footer Row
  const globalSum = appData.summary;
  tableFooterRow.innerHTML = `
    <td></td>
    <td class="text-left">Total General</td>
    <td class="text-right">${formatCurrency(globalSum.meta)}</td>
    <td class="text-right">${formatCurrency(globalSum.avance)}</td>
    <td class="text-center">-</td>
    <td class="text-right" style="color: ${globalSum.pctLogro >= 100 ? 'var(--success)' : 'var(--warning)'}">${globalSum.pctLogro}%</td>
    <td class="text-right">${formatCurrency(globalSum.promDiario)}</td>
    <td class="text-right">${formatCurrency(globalSum.proyeccion)}</td>
    <td class="text-right">${globalSum.alcance}%</td>
    <td class="text-right" style="color: ${globalSum.deficit >= 0 ? 'var(--success)' : 'var(--danger)'}">
      ${globalSum.deficit >= 0 ? '+' : ''}${formatCurrency(globalSum.deficit)}
    </td>
  `;
}

// Toggle portfolio collapse state
window.togglePortfolio = function(portName) {
  collapsedPortfolios[portName] = !collapsedPortfolios[portName];
  renderTreeTable();
};

// Render Sidebar Leaderboard Widget
function renderLeaderboard() {
  leaderboardList.innerHTML = '';
  
  // Gather all clients from portfolios
  const allClients = [];
  appData.portfolios.forEach(p => {
    p.clientes.forEach(c => {
      allClients.push(c);
    });
  });
  
  // Sort by % logro
  allClients.sort((a, b) => b.pctLogro - a.pctLogro);
  
  allClients.forEach((client, index) => {
    const li = document.createElement('li');
    let topClass = '';
    if (index === 0) topClass = 'top-1';
    else if (index === 1) topClass = 'top-2';
    else if (index === 2) topClass = 'top-3';
    else topClass = 'top-under';
    
    li.className = `leaderboard-item ${topClass}`;
    li.innerHTML = `
      <span class="rank-badge">${index + 1}</span>
      <span class="leaderboard-name" title="${client.cliente} (${client.grupo_portafolio})">${client.cliente}</span>
      <span class="leaderboard-val">${client.pctLogro}%</span>
    `;
    
    // Add click event to item to select the client in table too
    li.addEventListener('click', () => {
      selectedClient = client;
      collapsedPortfolios[client.grupo_portafolio] = false; // ensure expanded
      renderTreeTable();
      updateTariffWidget();
      
      // Scroll table to selected client row
      const rows = document.querySelectorAll('.child-row');
      rows.forEach(row => {
        if (row.querySelector('.client-name-cell').textContent.trim() === client.cliente) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });
    
    leaderboardList.appendChild(li);
  });
}

// Update Tariff Progression Widget details
function updateTariffWidget() {
  if (!selectedClient) {
    tariffDetailContainer.innerHTML = `
      <div class="no-selection-message">
        <i class="fa-solid fa-hand-pointer"></i>
        <p>Selecciona un cliente de la tabla para analizar su arancel y comisiones.</p>
      </div>
    `;
    return;
  }
  
  // Find current client instance from latest data to get simulated values
  let client = null;
  appData.portfolios.forEach(p => {
    const found = p.clientes.find(c => c.cliente === selectedClient.cliente);
    if (found) client = found;
  });
  
  if (!client) return;
  
  const arancelActualName = client.arancelActual ? client.arancelActual.nombre_arancel : 'Ninguno';
  const arancelActualTasa = client.arancelActual ? `${client.arancelActual.tasa_comision}%` : '0%';
  
  let nextArancelHtml = '';
  let progressHtml = '';
  
  if (client.arancelSiguiente) {
    const nextName = client.arancelSiguiente.nombre_arancel;
    const nextTasa = `${client.arancelSiguiente.tasa_comision}%`;
    const nextPctReq = client.arancelSiguiente.porcentaje_minimo;
    
    const distanceMonto = client.faltanteArancelMonto;
    const distancePct = client.faltanteArancelPct;
    
    // Progress calculation for progress bar
    // Current tier % to next tier %
    const minPct = client.arancelActual ? client.arancelActual.porcentaje_minimo : 0;
    const range = nextPctReq - minPct;
    const currentProgress = client.pctLogro - minPct;
    const progressPercent = Math.min(100, Math.max(0, (currentProgress / range) * 100));
    
    nextArancelHtml = `
      <div class="tariff-mini-card">
        <div class="tariff-mini-label">Siguiente Nivel</div>
        <div class="tariff-mini-val">${nextName} (${nextTasa})</div>
      </div>
    `;
    
    progressHtml = `
      <div class="tariff-progress-container">
        <div class="tariff-progress-meta">
          <span>Progreso al Siguiente Nivel</span>
          <span>${client.pctLogro.toFixed(1)}% / ${nextPctReq}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
      </div>
      
      <div class="tariff-alert">
        <i class="fa-solid fa-triangle-exclamation"></i>
        Faltan <strong>${formatCurrency(distanceMonto)}</strong> (${distancePct}%) para calificar al arancel <strong>${nextName} (${nextTasa})</strong>.
      </div>
    `;
  } else {
    nextArancelHtml = `
      <div class="tariff-mini-card active-bracket">
        <div class="tariff-mini-label">Siguiente Nivel</div>
        <div class="tariff-mini-val" style="color: var(--success)"><i class="fa-solid fa-circle-check"></i> Arancel Máximo</div>
      </div>
    `;
    progressHtml = `
      <div class="tariff-alert" style="background: rgba(16, 185, 129, 0.05); border-color: rgba(16, 185, 129, 0.2); color: var(--success)">
        <i class="fa-solid fa-trophy"></i> ¡Cliente en la escala máxima de arancel (comisión de ${arancelActualTasa})!
      </div>
    `;
  }
  
  tariffDetailContainer.innerHTML = `
    <div class="tariff-detail">
      <div class="tariff-client-name">
        ${client.cliente}
        <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 400; margin-top: 0.15rem;">
          Grupo: ${client.grupo_portafolio} | Posición: #${client.posicion}
        </div>
      </div>
      
      <div class="tariff-stats-row">
        <div class="tariff-mini-card active-bracket">
          <div class="tariff-mini-label">Arancel Actual</div>
          <div class="tariff-mini-val" style="color: var(--success)">${arancelActualName} (${arancelActualTasa})</div>
        </div>
        ${nextArancelHtml}
      </div>
      
      <div class="tariff-stats-row" style="margin-top: -0.25rem;">
        <div class="tariff-mini-card">
          <div class="tariff-mini-label">Meta de Ventas</div>
          <div class="tariff-mini-val">${formatCurrency(client.meta)}</div>
        </div>
        <div class="tariff-mini-card">
          <div class="tariff-mini-label">Avance Actual</div>
          <div class="tariff-mini-val">${formatCurrency(client.avance)}</div>
        </div>
      </div>
      
      ${progressHtml}
    </div>
  `;
}

// Render or Update Chart.js comparative performance chart
function updateChartData() {
  if (!appData) return;
  
  const labels = appData.portfolios.map(p => p.nombre.replace(/_/g, ' '));
  const metas = appData.portfolios.map(p => p.meta);
  const avances = appData.portfolios.map(p => p.avance);
  const proyecciones = appData.portfolios.map(p => p.proyeccion);
  
  if (performanceChart) {
    performanceChart.data.labels = labels;
    performanceChart.data.datasets[0].data = metas;
    performanceChart.data.datasets[1].data = avances;
    performanceChart.data.datasets[2].data = proyecciones;
    performanceChart.update();
  } else {
    const ctx = document.getElementById('performance-chart').getContext('2d');
    performanceChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Meta',
            data: metas,
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            borderColor: 'rgba(255, 255, 255, 0.2)',
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.8
          },
          {
            label: 'Cobrado Actual',
            data: avances,
            backgroundColor: 'rgba(16, 185, 129, 0.65)',
            borderColor: 'var(--success)',
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.8
          },
          {
            label: 'Proyección Cierre',
            data: proyecciones,
            backgroundColor: 'rgba(0, 102, 255, 0.4)',
            borderColor: 'var(--primary)',
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#94a3b8',
              font: {
                family: 'Plus Jakarta Sans',
                size: 11
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                if (context.raw !== null) {
                  label += currencyFormatter.format(context.raw);
                }
                return label;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans' } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { 
              color: '#94a3b8', 
              font: { family: 'Plus Jakarta Sans' },
              callback: function(value) {
                return '$' + (value / 1000) + 'k';
              }
            }
          }
        }
      }
    });
  }
}

// Event Listeners for Search & Filter
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderTreeTable();
});

filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    filterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.getAttribute('data-filter');
    renderTreeTable();
  });
});

// Event Listeners for Simulator
simProjectionType.addEventListener('change', (e) => {
  projectionType = e.target.value;
  fetchDashboardData();
});

simDaysSlider.addEventListener('input', (e) => {
  diasTranscurridos = parseInt(e.target.value);
  simDaysVal.textContent = `${diasTranscurridos} / 31`;
  debouncedFetch();
});

simSpeedSlider.addEventListener('input', (e) => {
  const percentVal = parseInt(e.target.value) - 100;
  simulationSpeed = parseFloat(e.target.value) / 100;
  simSpeedVal.textContent = `${percentVal >= 0 ? '+' : ''}${percentVal}% (${simulationSpeed.toFixed(2)}x)`;
  debouncedFetch();
});

resetSimBtn.addEventListener('click', () => {
  diasTranscurridos = 20;
  simulationSpeed = 1.0;
  projectionType = 'linear';
  
  simDaysSlider.value = 20;
  simDaysVal.textContent = '20 / 31';
  
  simSpeedSlider.value = 100;
  simSpeedVal.textContent = '+0% (1.0x)';
  
  simProjectionType.value = 'linear';
  
  fetchDashboardData();
});

// Initialize App
fetchDashboardData();
