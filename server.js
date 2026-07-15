const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.set('trust proxy', true); // Trust Vercel's proxy for HTTPS detection
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// Configuración de MySQL
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pr_mis_db',
  port: parseInt(process.env.DB_PORT || '3306'),
  connectTimeout: 2000 // Fails fast in serverless environment if host is unreachable
};

let pool = null;
let isDemoMode = false;

async function initDB() {
  if (pool || isDemoMode) return; // Prevent multiple initializations in serverless environment
  try {
    pool = mysql.createPool({
      ...dbConfig,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0
    });
    // Validar conexión
    const conn = await pool.getConnection();
    console.log(`[DB] Conectado exitosamente a MySQL (${dbConfig.host}:${dbConfig.database})`);
    conn.release();
  } catch (error) {
    console.warn(`[WARNING] No se pudo conectar a MySQL. Iniciando en MODO DEMO.`);
    console.warn(`[REASON] ${error.message}`);
    isDemoMode = true;
  }
}

// Datos Mock (idénticos a la imagen para Modo Demo)
const MOCK_ARANCELES = {
  BRADESCO: [
    { nombre_arancel: 'Base', porcentaje_minimo: 0, tasa_comision: 5.00 },
    { nombre_arancel: 'Bronce', porcentaje_minimo: 80, tasa_comision: 7.00 },
    { nombre_arancel: 'Plata', porcentaje_minimo: 95, tasa_comision: 9.00 },
    { nombre_arancel: 'Oro', porcentaje_minimo: 105, tasa_comision: 11.50 },
    { nombre_arancel: 'Platino', porcentaje_minimo: 115, tasa_comision: 13.00 }
  ],
  INVEX: [
    { nombre_arancel: 'Base', porcentaje_minimo: 0, tasa_comision: 4.50 },
    { nombre_arancel: 'Bronce', porcentaje_minimo: 75, tasa_comision: 6.50 },
    { nombre_arancel: 'Plata', porcentaje_minimo: 90, tasa_comision: 8.50 },
    { nombre_arancel: 'Oro', porcentaje_minimo: 100, tasa_comision: 10.50 },
    { nombre_arancel: 'Platino', porcentaje_minimo: 110, tasa_comision: 12.00 }
  ],
  CAJA_MORELIA_VALLADOLID: [
    { nombre_arancel: 'Base', porcentaje_minimo: 0, tasa_comision: 6.00 },
    { nombre_arancel: 'Bronce', porcentaje_minimo: 80, tasa_comision: 8.00 },
    { nombre_arancel: 'Plata', porcentaje_minimo: 90, tasa_comision: 10.00 },
    { nombre_arancel: 'Oro', porcentaje_minimo: 100, tasa_comision: 12.00 },
    { nombre_arancel: 'Platino', porcentaje_minimo: 110, tasa_comision: 14.00 }
  ]
};

const MOCK_METAS = [
  { grupo_portafolio: 'BRADESCO', cliente: 'HOYO NEGRO', monto_meta: 300000.00 },
  { grupo_portafolio: 'BRADESCO', cliente: 'BRADESCO BK1_PREV', monto_meta: 850000.00 },
  { grupo_portafolio: 'BRADESCO', cliente: 'BRADESCO BK1_2', monto_meta: 900000.00 },
  { grupo_portafolio: 'BRADESCO', cliente: 'BRADESCO', monto_meta: 500000.00 },
  
  { grupo_portafolio: 'INVEX', cliente: 'RLA', monto_meta: 120000.00 },
  { grupo_portafolio: 'INVEX', cliente: 'BK_2', monto_meta: 350000.00 },
  { grupo_portafolio: 'INVEX', cliente: 'RLB', monto_meta: 120000.00 },
  { grupo_portafolio: 'INVEX', cliente: 'RLN', monto_meta: 120000.00 },
  { grupo_portafolio: 'INVEX', cliente: 'BK_3', monto_meta: 450000.00 },
  
  { grupo_portafolio: 'CAJA_MORELIA_VALLADOLID', cliente: 'VALLADOLID TEMPRANA', monto_meta: 150000.00 },
  { grupo_portafolio: 'CAJA_MORELIA_VALLADOLID', cliente: 'CAJA VALLADOLID TDC', monto_meta: 260000.00 },
  { grupo_portafolio: 'CAJA_MORELIA_VALLADOLID', cliente: 'VALLADOLID_ELIMINADOS', monto_meta: 280000.00 }
];

const MOCK_AVANCES_BASE = {
  'HOYO NEGRO': 354966.00,
  'BRADESCO BK1_PREV': 997739.00,
  'BRADESCO BK1_2': 974940.00,
  'BRADESCO': 433233.00,
  'RLA': 121294.00,
  'BK_2': 307358.00,
  'RLB': 98392.00,
  'RLN': 91453.00,
  'BK_3': 332407.00,
  'VALLADOLID TEMPRANA': 126396.00,
  'CAJA VALLADOLID TDC': 181329.00,
  'VALLADOLID_ELIMINADOS': 145063.00
};

// Función para calcular los aranceles
function calculateArancelDetails(grupo, pctLogro, meta, avance, arancelesList) {
  const tiers = arancelesList[grupo] || [];
  if (tiers.length === 0) return { actual: null, siguiente: null, faltantePct: 0, faltanteMonto: 0 };
  
  // Buscar arancel actual (el mayor con porcentaje_minimo <= pctLogro)
  let currentTier = tiers[0];
  let nextTier = null;
  
  for (let i = 0; i < tiers.length; i++) {
    if (pctLogro >= tiers[i].porcentaje_minimo) {
      currentTier = tiers[i];
    }
  }
  
  // Buscar siguiente arancel
  const currentIndex = tiers.indexOf(currentTier);
  if (currentIndex < tiers.length - 1) {
    nextTier = tiers[currentIndex + 1];
  }
  
  let faltantePct = 0;
  let faltanteMonto = 0;
  
  if (nextTier) {
    faltantePct = nextTier.porcentaje_minimo - pctLogro;
    const requiredAmount = (nextTier.porcentaje_minimo / 100) * meta;
    faltanteMonto = Math.max(0, requiredAmount - avance);
  }
  
  return {
    actual: currentTier,
    siguiente: nextTier,
    faltantePct: parseFloat(faltantePct.toFixed(2)),
    faltanteMonto: parseFloat(faltanteMonto.toFixed(2))
  };
}

// Middleware para asegurar que la base de datos esté inicializada en cada petición (útil para serverless)
app.use(async (req, res, next) => {
  await initDB();
  next();
});

// Endpoint para el resumen y tabla de portafolios
app.get('/api/dashboard', async (req, res) => {
  try {
    const diasTranscurridos = parseInt(req.query.diasTranscurridos || '20');
    const totalDiasMes = parseInt(req.query.totalDiasMes || '31');
    const simulationSpeed = parseFloat(req.query.simulationSpeed || '1.0');
    const projectionType = req.query.projectionType || 'linear'; // 'linear' o 'static'
    
    let rawData = [];
    let arancelesData = MOCK_ARANCELES;
    
    if (!isDemoMode && pool) {
      try {
        // Query metas y avance acumulado de pagos
        const [rows] = await pool.query(`
          SELECT 
            m.grupo_portafolio,
            m.cliente,
            m.monto_meta AS meta,
            COALESCE(SUM(p.monto_pago), 0) AS avance
          FROM metas m
          LEFT JOIN acumulado_pagos p ON m.cliente = p.cliente AND p.fecha_pago BETWEEN '2026-07-01' AND '2026-07-31'
          WHERE m.mes = '2026-07'
          GROUP BY m.grupo_portafolio, m.cliente, m.monto_meta
        `);
        rawData = rows.map(r => ({
          grupo_portafolio: r.grupo_portafolio,
          cliente: r.cliente,
          monto_meta: parseFloat(r.meta),
          avance: parseFloat(r.avance)
        }));
        
        // Query aranceles
        const [arancelRows] = await pool.query(`
          SELECT grupo_portafolio, nombre_arancel, porcentaje_minimo, tasa_comision
          FROM aranceles
          ORDER BY grupo_portafolio, porcentaje_minimo ASC
        `);
        
        // Estructurar aranceles de la base de datos
        arancelesData = {};
        arancelRows.forEach(row => {
          if (!arancelesData[row.grupo_portafolio]) {
            arancelesData[row.grupo_portafolio] = [];
          }
          arancelesData[row.grupo_portafolio].push({
            nombre_arancel: row.nombre_arancel,
            porcentaje_minimo: parseFloat(row.porcentaje_minimo),
            tasa_comision: parseFloat(row.tasa_comision)
          });
        });
      } catch (err) {
        console.error('[DB ERROR] Error consultando MySQL. Usando fallback Mock.', err);
        rawData = [];
      }
    }
    
    // Si la base está vacía o en modo demo, usar mock
    if (rawData.length === 0) {
      rawData = MOCK_METAS.map(item => ({
        ...item,
        avance: (MOCK_AVANCES_BASE[item.cliente] || 0) * simulationSpeed
      }));
    }
    
    // 1. Calcular campos a nivel de cliente
    const processedClients = rawData.map(client => {
      const meta = client.monto_meta;
      const avance = client.avance;
      const pctLogro = meta > 0 ? (avance / meta) * 100 : 0;
      
      const promDiario = diasTranscurridos > 0 ? avance / diasTranscurridos : 0;
      
      let proyeccion = avance;
      if (projectionType === 'linear') {
        proyeccion = promDiario * totalDiasMes;
      }
      
      const alcance = meta > 0 ? (proyeccion / meta) * 100 : 0;
      const deficit = proyeccion - meta;
      
      const arancelDetails = calculateArancelDetails(
        client.grupo_portafolio,
        pctLogro,
        meta,
        avance,
        arancelesData
      );
      
      // Semáforo: verde >= 100%, naranja 80-100%, rojo < 80%
      let semaforo = 'red';
      if (pctLogro >= 100) semaforo = 'green';
      else if (pctLogro >= 80) semaforo = 'orange';
      
      return {
        grupo_portafolio: client.grupo_portafolio,
        cliente: client.cliente,
        meta,
        avance,
        pctLogro: parseFloat(pctLogro.toFixed(2)),
        promDiario: parseFloat(promDiario.toFixed(2)),
        proyeccion: parseFloat(proyeccion.toFixed(2)),
        alcance: parseFloat(alcance.toFixed(2)),
        deficit: parseFloat(deficit.toFixed(2)),
        semaforo,
        arancelActual: arancelDetails.actual,
        arancelSiguiente: arancelDetails.siguiente,
        faltanteArancelPct: arancelDetails.faltantePct,
        faltanteArancelMonto: arancelDetails.faltanteMonto
      };
    });
    
    // 2. Ordenar clientes para calcular las posiciones (rankings) globales
    const rankedClients = [...processedClients]
      .sort((a, b) => b.pctLogro - a.pctLogro)
      .map((c, index) => ({ ...c, posicion: index + 1 }));
      
    // Re-mapear al orden original para la jerarquía del portafolio
    const clientsWithRank = processedClients.map(c => {
      const found = rankedClients.find(rc => rc.cliente === c.cliente);
      return { ...c, posicion: found ? found.posicion : 0 };
    });
    
    // 3. Agrupar por portafolio
    const portfoliosMap = {};
    clientsWithRank.forEach(client => {
      const g = client.grupo_portafolio;
      if (!portfoliosMap[g]) {
        portfoliosMap[g] = {
          nombre: g,
          meta: 0,
          avance: 0,
          promDiario: 0,
          proyeccion: 0,
          deficit: 0,
          clientes: []
        };
      }
      portfoliosMap[g].clientes.push(client);
      portfoliosMap[g].meta += client.meta;
      portfoliosMap[g].avance += client.avance;
      portfoliosMap[g].promDiario += client.promDiario;
      portfoliosMap[g].proyeccion += client.proyeccion;
      portfoliosMap[g].deficit += client.deficit;
    });
    
    // Estructurar portafolios agregando totales y porcentajes agregados
    const portfolios = Object.values(portfoliosMap).map(p => {
      const pctLogro = p.meta > 0 ? (p.avance / p.meta) * 100 : 0;
      const alcance = p.meta > 0 ? (p.proyeccion / p.meta) * 100 : 0;
      return {
        ...p,
        pctLogro: parseFloat(pctLogro.toFixed(2)),
        alcance: parseFloat(alcance.toFixed(2)),
        meta: parseFloat(p.meta.toFixed(2)),
        avance: parseFloat(p.avance.toFixed(2)),
        promDiario: parseFloat(p.promDiario.toFixed(2)),
        proyeccion: parseFloat(p.proyeccion.toFixed(2)),
        deficit: parseFloat(p.deficit.toFixed(2))
      };
    });
    
    // 4. Totales globales
    let globalMeta = 0;
    let globalAvance = 0;
    let globalPromDiario = 0;
    let globalProyeccion = 0;
    let globalDeficit = 0;
    
    portfolios.forEach(p => {
      globalMeta += p.meta;
      globalAvance += p.avance;
      globalPromDiario += p.promDiario;
      globalProyeccion += p.proyeccion;
      globalDeficit += p.deficit;
    });
    
    const globalPctLogro = globalMeta > 0 ? (globalAvance / globalMeta) * 100 : 0;
    const globalAlcance = globalMeta > 0 ? (globalProyeccion / globalMeta) * 100 : 0;
    
    res.json({
      isDemoMode,
      diasTranscurridos,
      totalDiasMes,
      simulationSpeed,
      projectionType,
      portfolios,
      summary: {
        meta: parseFloat(globalMeta.toFixed(2)),
        avance: parseFloat(globalAvance.toFixed(2)),
        pctLogro: parseFloat(globalPctLogro.toFixed(2)),
        promDiario: parseFloat(globalPromDiario.toFixed(2)),
        proyeccion: parseFloat(globalProyeccion.toFixed(2)),
        alcance: parseFloat(globalAlcance.toFixed(2)),
        deficit: parseFloat(globalDeficit.toFixed(2))
      }
    });
    
  } catch (error) {
    console.error('[API ERROR] /api/dashboard failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para el ranking general simplificado
app.get('/api/rankings', async (req, res) => {
  try {
    const simulationSpeed = parseFloat(req.query.simulationSpeed || '1.0');
    let rawData = [];
    
    if (!isDemoMode && pool) {
      try {
        const [rows] = await pool.query(`
          SELECT 
            m.cliente,
            m.grupo_portafolio,
            m.monto_meta AS meta,
            COALESCE(SUM(p.monto_pago), 0) AS avance
          FROM metas m
          LEFT JOIN acumulado_pagos p ON m.cliente = p.cliente AND p.fecha_pago BETWEEN '2026-07-01' AND '2026-07-31'
          WHERE m.mes = '2026-07'
          GROUP BY m.cliente, m.grupo_portafolio, m.monto_meta
        `);
        rawData = rows.map(r => ({
          cliente: r.cliente,
          grupo_portafolio: r.grupo_portafolio,
          meta: parseFloat(r.meta),
          avance: parseFloat(r.avance)
        }));
      } catch (err) {
        rawData = [];
      }
    }
    
    if (rawData.length === 0) {
      rawData = MOCK_METAS.map(item => ({
        cliente: item.cliente,
        grupo_portafolio: item.grupo_portafolio,
        meta: item.monto_meta,
        avance: (MOCK_AVANCES_BASE[item.cliente] || 0) * simulationSpeed
      }));
    }
    
    const rankings = rawData.map(item => {
      const pctLogro = item.meta > 0 ? (item.avance / item.meta) * 100 : 0;
      return {
        cliente: item.cliente,
        grupo_portafolio: item.grupo_portafolio,
        meta: item.meta,
        avance: item.avance,
        pctLogro: parseFloat(pctLogro.toFixed(2))
      };
    }).sort((a, b) => b.pctLogro - a.pctLogro);
    
    res.json(rankings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint de configuración / estado del servidor
app.get('/api/config', (req, res) => {
  res.json({
    isDemoMode,
    dbConfigured: !!process.env.DB_HOST,
    dbHost: dbConfig.host,
    dbName: dbConfig.database,
    nodeVersion: process.version
  });
});

if (require.main === module) {
  app.listen(PORT, async () => {
    await initDB();
    console.log(`[SERVER] Servidor corriendo en http://localhost:${PORT}`);
  });
}

module.exports = app;
