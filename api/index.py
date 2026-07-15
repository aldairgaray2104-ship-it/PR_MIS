import os
import ssl
import sys
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pymysql
from dotenv import load_dotenv

# Cargar variables de entorno del archivo .env
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configuración de base de datos
DB_HOST = os.getenv('DB_HOST', 'localhost')

# Sanitizar DB_HOST si el usuario colocó http://, https:// o barra diagonal final
if DB_HOST.startswith('http://'):
    DB_HOST = DB_HOST[7:]
elif DB_HOST.startswith('https://'):
    DB_HOST = DB_HOST[8:]
if DB_HOST.endswith('/'):
    DB_HOST = DB_HOST[:-1]

DB_USER = os.getenv('DB_USER', 'avnadmin')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')
DB_NAME = os.getenv('DB_NAME', 'pr_mis_db')
try:
    DB_PORT = int(os.getenv('DB_PORT', '3306'))
except ValueError:
    DB_PORT = 3306

is_demo_mode = False
db_error = None

# Contexto SSL para Aiven (equivalente a rejectUnauthorized: false)
def get_ssl_context():
    # Solo usar SSL si no estamos en localhost
    if DB_HOST in ['localhost', '127.0.0.1']:
        return None
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx
    except Exception:
        return None

def get_db_connection():
    ssl_ctx = get_ssl_context()
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        port=DB_PORT,
        connect_timeout=5,
        ssl=ssl_ctx,
        cursorclass=pymysql.cursors.DictCursor
    )

def check_db_connection():
    global is_demo_mode, db_error
    # Solo intentamos verificar si no estamos ya en modo demo
    if is_demo_mode:
        return
    
    try:
        conn = get_db_connection()
        conn.close()
        # Conexión exitosa, nos aseguramos que is_demo_mode sea False
        is_demo_mode = False
        db_error = None
    except Exception as e:
        print(f"[WARNING] No se pudo conectar a MySQL. Iniciando en MODO DEMO.")
        print(f"[REASON] {str(e)}")
        db_error = str(e)
        is_demo_mode = True

# Datos Mock para Modo Demo
MOCK_ARANCELES = {
    'BRADESCO': [
        { 'nombre_arancel': 'Base', 'porcentaje_minimo': 0, 'tasa_comision': 5.00 },
        { 'nombre_arancel': 'Bronce', 'porcentaje_minimo': 80, 'tasa_comision': 7.00 },
        { 'nombre_arancel': 'Plata', 'porcentaje_minimo': 95, 'tasa_comision': 9.00 },
        { 'nombre_arancel': 'Oro', 'porcentaje_minimo': 105, 'tasa_comision': 11.50 },
        { 'nombre_arancel': 'Platino', 'porcentaje_minimo': 115, 'tasa_comision': 13.00 }
    ],
    'INVEX': [
        { 'nombre_arancel': 'Base', 'porcentaje_minimo': 0, 'tasa_comision': 4.50 },
        { 'nombre_arancel': 'Bronce', 'porcentaje_minimo': 75, 'tasa_comision': 6.50 },
        { 'nombre_arancel': 'Plata', 'porcentaje_minimo': 90, 'tasa_comision': 8.50 },
        { 'nombre_arancel': 'Oro', 'porcentaje_minimo': 100, 'tasa_comision': 10.50 },
        { 'nombre_arancel': 'Platino', 'porcentaje_minimo': 110, 'tasa_comision': 12.00 }
    ],
    'CAJA_MORELIA_VALLADOLID': [
        { 'nombre_arancel': 'Base', 'porcentaje_minimo': 0, 'tasa_comision': 6.00 },
        { 'nombre_arancel': 'Bronce', 'porcentaje_minimo': 80, 'tasa_comision': 8.00 },
        { 'nombre_arancel': 'Plata', 'porcentaje_minimo': 90, 'tasa_comision': 10.00 },
        { 'nombre_arancel': 'Oro', 'porcentaje_minimo': 100, 'tasa_comision': 12.00 },
        { 'nombre_arancel': 'Platino', 'porcentaje_minimo': 110, 'tasa_comision': 14.00 }
    ]
}

MOCK_METAS = [
    { 'grupo_portafolio': 'BRADESCO', 'cliente': 'HOYO NEGRO', 'monto_meta': 300000.00 },
    { 'grupo_portafolio': 'BRADESCO', 'cliente': 'BRADESCO BK1_PREV', 'monto_meta': 850000.00 },
    { 'grupo_portafolio': 'BRADESCO', 'cliente': 'BRADESCO BK1_2', 'monto_meta': 900000.00 },
    { 'grupo_portafolio': 'BRADESCO', 'cliente': 'BRADESCO', 'monto_meta': 500000.00 },
    
    { 'grupo_portafolio': 'INVEX', 'cliente': 'RLA', 'monto_meta': 120000.00 },
    { 'grupo_portafolio': 'INVEX', 'cliente': 'BK_2', 'monto_meta': 350000.00 },
    { 'grupo_portafolio': 'INVEX', 'cliente': 'RLB', 'monto_meta': 120000.00 },
    { 'grupo_portafolio': 'INVEX', 'cliente': 'RLN', 'monto_meta': 120000.00 },
    { 'grupo_portafolio': 'INVEX', 'cliente': 'BK_3', 'monto_meta': 450000.00 },
    
    { 'grupo_portafolio': 'CAJA_MORELIA_VALLADOLID', 'cliente': 'VALLADOLID TEMPRANA', 'monto_meta': 150000.00 },
    { 'grupo_portafolio': 'CAJA_MORELIA_VALLADOLID', 'cliente': 'CAJA VALLADOLID TDC', 'monto_meta': 260000.00 },
    { 'grupo_portafolio': 'CAJA_MORELIA_VALLADOLID', 'cliente': 'VALLADOLID_ELIMINADOS', 'monto_meta': 280000.00 }
]

MOCK_AVANCES_BASE = {
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
}

def calculate_arancel_details(grupo, pct_logro, meta, avance, aranceles_list):
    tiers = aranceles_list.get(grupo, [])
    if not tiers:
        return { 'actual': None, 'siguiente': None, 'faltantePct': 0.0, 'faltanteMonto': 0.0 }
    
    current_tier = tiers[0]
    next_tier = None
    
    for tier in tiers:
        if pct_logro >= float(tier['porcentaje_minimo']):
            current_tier = tier
            
    try:
        current_index = tiers.index(current_tier)
    except ValueError:
        current_index = -1
        
    if current_index != -1 and current_index < len(tiers) - 1:
        next_tier = tiers[current_index + 1]
        
    faltante_pct = 0.0
    faltante_monto = 0.0
    
    if next_tier:
        faltante_pct = float(next_tier['porcentaje_minimo']) - pct_logro
        required_amount = (float(next_tier['porcentaje_minimo']) / 100.0) * meta
        faltante_monto = max(0.0, required_amount - avance)
        
    # Limpiar tipos para la serialización JSON
    def sanitize_tier(t):
        if not t:
            return None
        return {
            'nombre_arancel': t['nombre_arancel'],
            'porcentaje_minimo': float(t['porcentaje_minimo']),
            'tasa_comision': float(t['tasa_comision'])
        }

    return {
        'actual': sanitize_tier(current_tier),
        'siguiente': sanitize_tier(next_tier),
        'faltantePct': round(faltante_pct, 2),
        'faltanteMonto': round(faltante_monto, 2)
    }

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    global is_demo_mode
    check_db_connection()
    
    try:
        dias_transcurridos = int(request.args.get('diasTranscurridos', '20'))
        total_dias_mes = int(request.args.get('totalDiasMes', '31'))
        simulation_speed = float(request.args.get('simulationSpeed', '1.0'))
        projection_type = request.args.get('projectionType', 'linear')
    except ValueError:
        dias_transcurridos = 20
        total_dias_mes = 31
        simulation_speed = 1.0
        projection_type = 'linear'
        
    raw_data = []
    aranceles_data = MOCK_ARANCELES
    
    if not is_demo_mode:
        try:
            conn = get_db_connection()
            with conn.cursor() as cursor:
                # Query metas y avances
                cursor.execute("""
                    SELECT 
                        m.grupo_portafolio,
                        m.cliente,
                        m.monto_meta AS meta,
                        COALESCE(SUM(p.monto_pago), 0) AS avance
                    FROM metas m
                    LEFT JOIN acumulado_pagos p ON m.cliente = p.cliente AND p.fecha_pago BETWEEN '2026-07-01' AND '2026-07-31'
                    WHERE m.mes = '2026-07'
                    GROUP BY m.grupo_portafolio, m.cliente, m.monto_meta
                """)
                db_rows = cursor.fetchall()
                raw_data = [{
                    'grupo_portafolio': r['grupo_portafolio'],
                    'cliente': r['cliente'],
                    'monto_meta': float(r['meta']),
                    'avance': float(r['avance'])
                } for r in db_rows]
                
                # Query aranceles
                cursor.execute("""
                    SELECT grupo_portafolio, nombre_arancel, porcentaje_minimo, tasa_comision
                    FROM aranceles
                    ORDER BY grupo_portafolio, porcentaje_minimo ASC
                """)
                arancel_rows = cursor.fetchall()
                
                aranceles_data = {}
                for row in arancel_rows:
                    gp = row['grupo_portafolio']
                    if gp not in aranceles_data:
                        aranceles_data[gp] = []
                    aranceles_data[gp].append({
                        'nombre_arancel': row['nombre_arancel'],
                        'porcentaje_minimo': float(row['porcentaje_minimo']),
                        'tasa_comision': float(row['tasa_comision'])
                    })
            conn.close()
        except Exception as e:
            print(f"[DB ERROR] Error consultando MySQL. Usando fallback Mock: {str(e)}")
            raw_data = []
            
    # Si está vacío o falló la BD, usar mock
    if not raw_data:
        raw_data = [{
            'grupo_portafolio': item['grupo_portafolio'],
            'cliente': item['cliente'],
            'monto_meta': item['monto_meta'],
            'avance': (MOCK_AVANCES_BASE.get(item['cliente'], 0.0)) * simulation_speed
        } for item in MOCK_METAS]
        
    # Calcular campos a nivel de cliente
    processed_clients = []
    for client in raw_data:
        meta = client['monto_meta']
        avance = client['avance']
        pct_logro = (avance / meta * 100.0) if meta > 0 else 0.0
        
        prom_diario = (avance / dias_transcurridos) if dias_transcurridos > 0 else 0.0
        
        if projection_type == 'linear':
            proyeccion = prom_diario * total_dias_mes
        else:
            proyeccion = avance
            
        alcance = (proyeccion / meta * 100.0) if meta > 0 else 0.0
        deficit = proyeccion - meta
        
        arancel_details = calculate_arancel_details(
            client['grupo_portafolio'],
            pct_logro,
            meta,
            avance,
            aranceles_data
        )
        
        semaforo = 'red'
        if pct_logro >= 100:
            semaforo = 'green'
        elif pct_logro >= 80:
            semaforo = 'orange'
            
        processed_clients.append({
            'grupo_portafolio': client['grupo_portafolio'],
            'cliente': client['cliente'],
            'meta': meta,
            'avance': avance,
            'pctLogro': round(pct_logro, 2),
            'promDiario': round(prom_diario, 2),
            'proyeccion': round(proyeccion, 2),
            'alcance': round(alcance, 2),
            'deficit': round(deficit, 2),
            'semaforo': semaforo,
            'arancelActual': arancel_details['actual'],
            'arancelSiguiente': arancel_details['siguiente'],
            'faltanteArancelPct': arancel_details['faltantePct'],
            'faltanteArancelMonto': arancel_details['faltanteMonto']
        })
        
    # Calcular posiciones globales (rankings)
    ranked_clients = sorted(processed_clients, key=lambda c: c['pctLogro'], reverse=True)
    for i, rc in enumerate(ranked_clients):
        rc['posicion'] = i + 1
        
    # Volver a asignar la posición en el orden original
    for client in processed_clients:
        found = next((rc for rc in ranked_clients if rc['cliente'] == client['cliente']), None)
        client['posicion'] = found['posicion'] if found else 0
        
    # Agrupar por portafolio
    portfolios_map = {}
    for client in processed_clients:
        g = client['grupo_portafolio']
        if g not in portfolios_map:
            portfolios_map[g] = {
                'nombre': g,
                'meta': 0.0,
                'avance': 0.0,
                'promDiario': 0.0,
                'proyeccion': 0.0,
                'deficit': 0.0,
                'clientes': []
            }
        portfolios_map[g]['clientes'].append(client)
        portfolios_map[g]['meta'] += client['meta']
        portfolios_map[g]['avance'] += client['avance']
        portfolios_map[g]['promDiario'] += client['promDiario']
        portfolios_map[g]['proyeccion'] += client['proyeccion']
        portfolios_map[g]['deficit'] += client['deficit']
        
    # Formatear portafolios con totales agregados
    portfolios = []
    for g, p in portfolios_map.items():
        pct_logro = (p['avance'] / p['meta'] * 100.0) if p['meta'] > 0 else 0.0
        alcance = (p['proyeccion'] / p['meta'] * 100.0) if p['meta'] > 0 else 0.0
        portfolios.append({
            'nombre': p['nombre'],
            'clientes': p['clientes'],
            'pctLogro': round(pct_logro, 2),
            'alcance': round(alcance, 2),
            'meta': round(p['meta'], 2),
            'avance': round(p['avance'], 2),
            'promDiario': round(p['promDiario'], 2),
            'proyeccion': round(p['proyeccion'], 2),
            'deficit': round(p['deficit'], 2)
        })
        
    # Totales globales
    global_meta = sum(p['meta'] for p in portfolios)
    global_avance = sum(p['avance'] for p in portfolios)
    global_prom_diario = sum(p['promDiario'] for p in portfolios)
    global_proyeccion = sum(p['proyeccion'] for p in portfolios)
    global_deficit = sum(p['deficit'] for p in portfolios)
    
    global_pct_logro = (global_avance / global_meta * 100.0) if global_meta > 0 else 0.0
    global_alcance = (global_proyeccion / global_meta * 100.0) if global_meta > 0 else 0.0
    
    return jsonify({
        'isDemoMode': is_demo_mode,
        'diasTranscurridos': dias_transcurridos,
        'totalDiasMes': total_dias_mes,
        'simulationSpeed': simulation_speed,
        'projectionType': projection_type,
        'portfolios': portfolios,
        'summary': {
            'meta': round(global_meta, 2),
            'avance': round(global_avance, 2),
            'pctLogro': round(global_pct_logro, 2),
            'promDiario': round(global_prom_diario, 2),
            'proyeccion': round(global_proyeccion, 2),
            'alcance': round(global_alcance, 2),
            'deficit': round(global_deficit, 2)
        }
    })

@app.route('/api/rankings', methods=['GET'])
def get_rankings():
    global is_demo_mode
    check_db_connection()
    
    try:
        simulation_speed = float(request.args.get('simulationSpeed', '1.0'))
    except ValueError:
        simulation_speed = 1.0
        
    raw_data = []
    
    if not is_demo_mode:
        try:
            conn = get_db_connection()
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        m.cliente,
                        m.grupo_portafolio,
                        m.monto_meta AS meta,
                        COALESCE(SUM(p.monto_pago), 0) AS avance
                    FROM metas m
                    LEFT JOIN acumulado_pagos p ON m.cliente = p.cliente AND p.fecha_pago BETWEEN '2026-07-01' AND '2026-07-31'
                    WHERE m.mes = '2026-07'
                    GROUP BY m.cliente, m.grupo_portafolio, m.monto_meta
                """)
                db_rows = cursor.fetchall()
                raw_data = [{
                    'cliente': r['cliente'],
                    'grupo_portafolio': r['grupo_portafolio'],
                    'meta': float(r['meta']),
                    'avance': float(r['avance'])
                } for r in db_rows]
            conn.close()
        except Exception:
            raw_data = []
            
    if not raw_data:
        raw_data = [{
            'cliente': item['cliente'],
            'grupo_portafolio': item['grupo_portafolio'],
            'meta': item['monto_meta'],
            'avance': (MOCK_AVANCES_BASE.get(item['cliente'], 0.0)) * simulation_speed
        } for item in MOCK_METAS]
        
    rankings = []
    for item in raw_data:
        meta = item['meta']
        avance = item['avance']
        pct_logro = (avance / meta * 100.0) if meta > 0 else 0.0
        rankings.append({
            'cliente': item['cliente'],
            'grupo_portafolio': item['grupo_portafolio'],
            'meta': meta,
            'avance': avance,
            'pctLogro': round(pct_logro, 2)
        })
        
    rankings.sort(key=lambda r: r['pctLogro'], reverse=True)
    return jsonify(rankings)

@app.route('/api/config', methods=['GET'])
def get_config():
    global is_demo_mode, db_error
    check_db_connection()
    return jsonify({
        'isDemoMode': is_demo_mode,
        'dbError': db_error,
        'dbConfigured': DB_HOST != 'localhost',
        'dbHost': DB_HOST,
        'dbName': DB_NAME,
        'pythonVersion': sys.version
    })

# --- ENRUTAMIENTO ESTÁTICO (Solo para desarrollo local con Python) ---
# En Vercel, estas rutas estáticas no se llaman debido a los rewrites en vercel.json.
public_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'public'))

@app.route('/')
def serve_index():
    return send_from_directory(public_dir, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(public_dir, path)

if __name__ == '__main__':
    # Verificar conexión inicial al arrancar
    check_db_connection()
    print(f"[SERVER] Servidor Flask corriendo en http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
