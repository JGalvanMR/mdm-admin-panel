import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    Battery, BatteryCharging, Wifi, WifiOff, HardDrive,
    Monitor, Clock, RefreshCw, ArrowLeft, MapPin,
    Activity, Smartphone, Signal, MemoryStick,
    Play, Square, Navigation, Crosshair
} from 'lucide-react';
import api, { LocationPoint, Geofence } from '../services/api';
import MapComponent from '../components/MapComponent';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface TelemetryRow {
    id: number;
    deviceId: string;
    batteryLevel: number | null;
    batteryCharging: boolean;
    storageAvailableMB: number | null;
    totalStorageMB: number | null;
    connectionType: string | null;
    ssid: string | null;
    signalStrength: number | null;
    ipAddress: string | null;
    kioskModeEnabled: boolean;
    cameraDisabled: boolean;
    screenOn: boolean;
    uptimeHours: number;
    ramUsedMB: number | null;
    cpuTemp: number | null;
    recordedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function batteryColor(level: number | null): string {
    if (level === null) return 'text-gray-500';
    if (level > 50) return 'text-emerald-400';
    if (level > 20) return 'text-amber-400';
    return 'text-red-400';
}

function signalBars(rssi: number | null): string {
    if (rssi === null) return '—';
    if (rssi >= -50) return '████';
    if (rssi >= -60) return '███░';
    if (rssi >= -70) return '██░░';
    if (rssi >= -80) return '█░░░';
    return '░░░░';
}

function fmtStorage(avail: number | null, total: number | null): string {
    if (!avail) return '—';
    if (!total) return `${avail} MB libre`;
    const pct = Math.round((avail / total) * 100);
    return `${avail} MB / ${total} MB (${pct}% libre)`;
}

function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-ES', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function ago(iso: string): string {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `hace ${s}s`;
    if (s < 3600) return `hace ${Math.floor(s / 60)}min`;
    return `hace ${Math.floor(s / 3600)}h`;
}

// ── Mini stat card ─────────────────────────────────────────────────────────────
function Stat({
    icon: Icon, label, value, color = 'text-gray-300', sub,
}: {
    icon: React.ElementType; label: string; value: string; color?: string; sub?: string;
}) {
    return (
        <div className="bg-gray-800/60 rounded-xl p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wider">
                <Icon className="w-3.5 h-3.5" />
                {label}
            </div>
            <p className={`text-lg font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-gray-600">{sub}</p>}
        </div>
    );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function MonitoringPage() {
    const { deviceId } = useParams<{ deviceId?: string }>();
    const [devices, setDevices] = useState<{ deviceId: string; deviceName: string | null }[]>([]);
    const [selDevice, setSelDevice] = useState(deviceId || '');
    const [latest, setLatest] = useState<TelemetryRow | null>(null);
    const [history, setHistory] = useState<TelemetryRow[]>([]);
    const [locations, setLocations] = useState<LocationPoint[]>([]);
    const [geofences, setGeofences] = useState<Geofence[]>([]);
    const [loading, setLoading] = useState(false);
    const [hours, setHours] = useState(24);
    const [trackingLoading, setTrackingLoading] = useState(false);

    // Cargar lista de dispositivos
    useEffect(() => {
        api.getDevices().then(r => {
            if (r.success && r.data) {
                setDevices(r.data.devices.map(d => ({
                    deviceId: d.deviceId,
                    deviceName: d.deviceName,
                })));
                if (!selDevice && r.data.devices.length > 0)
                    setSelDevice(r.data.devices[0].deviceId);
            }
        });
    }, []);

    const load = useCallback(async () => {
        if (!selDevice) return;
        setLoading(true);
        try {
            const [latRes, histRes, locRes, geoRes] = await Promise.all([
                fetch(`${import.meta.env.VITE_SERVER_URL || 'http://192.168.123.155:5000'}/api/admin/devices/${encodeURIComponent(selDevice)}/telemetry/latest`, {
                    headers: { 'X-Admin-Key': localStorage.getItem('mdm_admin_key') || '' }
                }).then(r => r.json()),
                fetch(`${import.meta.env.VITE_SERVER_URL || 'http://192.168.123.155:5000'}/api/admin/devices/${encodeURIComponent(selDevice)}/telemetry?hoursBack=${hours}&maxRows=100`, {
                    headers: { 'X-Admin-Key': localStorage.getItem('mdm_admin_key') || '' }
                }).then(r => r.json()),
                api.getLocationHistory(selDevice, hours),
                api.getGeofences(selDevice).catch(() => ({ success: true, data: [] }))
            ]);

            if (latRes.success && latRes.data) setLatest(latRes.data);
            if (histRes.success && histRes.data) setHistory(histRes.data.rows || []);
            if (locRes.success && locRes.data) setLocations(locRes.data.points || []);
            if (geoRes.success && geoRes.data) setGeofences(geoRes.data);
        } finally {
            setLoading(false);
        }
    }, [selDevice, hours]);

    useEffect(() => {
        load();
        const iv = setInterval(load, 30_000);
        return () => clearInterval(iv);
    }, [load]);

    const handleStartTracking = async () => {
        if (!selDevice) return;
        setTrackingLoading(true);
        const res = await api.startLocationTracking(selDevice, 60, 10);
        setTrackingLoading(false);
        if (res.success) {
            alert('Tracking iniciado. El dispositivo reportará ubicación cada 60 segundos.');
        } else {
            alert('Error: ' + (res.error || 'No se pudo iniciar tracking'));
        }
    };

    const handleStopTracking = async () => {
        if (!selDevice) return;
        setTrackingLoading(true);
        const res = await api.stopLocationTracking(selDevice);
        setTrackingLoading(false);
        if (res.success) {
            alert('Tracking detenido.');
        } else {
            alert('Error: ' + (res.error || 'No se pudo detener tracking'));
        }
    };

    return (
        <div className="space-y-6">

            {/* Encabezado */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link to="/" className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Monitoreo</h1>
                        <p className="text-sm text-gray-400">Telemetría en tiempo real</p>
                    </div>
                </div>
                <button onClick={load}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700
            text-gray-300 rounded-lg transition-colors">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Actualizar
                </button>
            </div>

            {/* Selector de dispositivo + rango */}
            <div className="flex flex-col sm:flex-row gap-3">
                <select
                    value={selDevice}
                    onChange={e => setSelDevice(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg
            text-white text-sm focus:outline-none focus:border-emerald-500"
                >
                    {devices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                            {d.deviceName || d.deviceId}
                        </option>
                    ))}
                </select>
                <select
                    value={hours}
                    onChange={e => setHours(parseInt(e.target.value))}
                    className="px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg
            text-white text-sm focus:outline-none focus:border-emerald-500"
                >
                    <option value={1}>Última hora</option>
                    <option value={6}>Últimas 6h</option>
                    <option value={24}>Últimas 24h</option>
                    <option value={72}>Últimos 3 días</option>
                </select>
            </div>

            {/* Controles de Tracking */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                        <Navigation className="w-5 h-5 text-emerald-400" />
                        Control de Tracking GPS
                    </h3>
                    <div className="flex gap-2">
                        <button
                            onClick={handleStartTracking}
                            disabled={trackingLoading || !selDevice}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 
                text-emerald-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            <Play className="w-4 h-4" />
                            Iniciar Tracking
                        </button>
                        <button
                            onClick={handleStopTracking}
                            disabled={trackingLoading || !selDevice}
                            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 
                text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            <Square className="w-4 h-4" />
                            Detener Tracking
                        </button>
                    </div>
                </div>
                <p className="text-xs text-gray-500">
                    El tracking continuo mantiene el GPS activo y reporta ubicación cada 60 segundos.
                    Consume más batería pero permite historial preciso.
                </p>
            </div>

            {/* Mapa de Ubicación */}
            {locations.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-base font-semibold text-white flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-blue-400" />
                            Mapa de Ubicación
                        </h3>
                        <span className="text-xs text-gray-500">{locations.length} puntos</span>
                    </div>
                    <MapComponent
                        locations={locations}
                        geofences={geofences}
                        height="400px"
                    />
                </div>
            )}

            {/* Estado actual */}
            {latest ? (
                <>
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                            Estado actual
                        </h2>
                        <span className="text-xs text-gray-600">
                            {ago(latest.recordedAt)} · {fmtTime(latest.recordedAt)}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Stat
                            icon={latest.batteryCharging ? BatteryCharging : Battery}
                            label="Batería"
                            value={latest.batteryLevel !== null ? `${latest.batteryLevel}%` : '—'}
                            color={batteryColor(latest.batteryLevel)}
                            sub={latest.batteryCharging ? 'Cargando' : 'Descargando'}
                        />
                        <Stat
                            icon={HardDrive}
                            label="Almacenamiento"
                            value={latest.storageAvailableMB !== null ? `${latest.storageAvailableMB} MB` : '—'}
                            sub={fmtStorage(latest.storageAvailableMB, latest.totalStorageMB)}
                        />
                        <Stat
                            icon={MemoryStick}
                            label="RAM usada"
                            value={latest.ramUsedMB !== null ? `${latest.ramUsedMB} MB` : '—'}
                        />
                        <Stat
                            icon={Clock}
                            label="Uptime"
                            value={`${latest.uptimeHours}h`}
                            sub="desde último reinicio"
                        />
                        <Stat
                            icon={latest.connectionType === 'NONE' ? WifiOff : Wifi}
                            label="Conexión"
                            value={latest.connectionType || '—'}
                            color={latest.connectionType === 'NONE' ? 'text-red-400' : 'text-emerald-400'}
                            sub={latest.ssid || undefined}
                        />
                        <Stat
                            icon={Signal}
                            label="Señal WiFi"
                            value={latest.signalStrength !== null ? `${latest.signalStrength} dBm` : '—'}
                            sub={signalBars(latest.signalStrength)}
                        />
                        <Stat
                            icon={Monitor}
                            label="Pantalla"
                            value={latest.screenOn ? 'Encendida' : 'Apagada'}
                            color={latest.screenOn ? 'text-emerald-400' : 'text-gray-500'}
                        />
                        <Stat
                            icon={Smartphone}
                            label="IP"
                            value={latest.ipAddress || '—'}
                            sub={latest.ssid ? `Red: ${latest.ssid}` : undefined}
                        />
                    </div>

                    {/* Badges de política */}
                    <div className="flex flex-wrap gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${latest.kioskModeEnabled
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'bg-gray-800 text-gray-500'
                            }`}>
                            Kiosk {latest.kioskModeEnabled ? 'activo' : 'inactivo'}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${latest.cameraDisabled
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                            }`}>
                            Cámara {latest.cameraDisabled ? 'deshabilitada' : 'habilitada'}
                        </span>
                    </div>
                </>
            ) : !loading ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                    <Activity className="w-14 h-14 mx-auto mb-4 text-gray-700" />
                    <p className="text-gray-400 font-medium">Sin telemetría disponible</p>
                    <p className="text-sm text-gray-600 mt-1">
                        El dispositivo debe enviar telemetría al menos una vez
                    </p>
                </div>
            ) : (
                <div className="flex items-center justify-center h-32">
                    <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                </div>
            )}

            {/* Historial */}
            {history.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">
                            Historial — últimas {hours}h
                        </h3>
                        <span className="text-xs text-gray-600">{history.length} registros</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-gray-800 text-gray-600 uppercase tracking-wider">
                                    <th className="px-3 py-2 text-left">Hora</th>
                                    <th className="px-3 py-2 text-right">Batería</th>
                                    <th className="px-3 py-2 text-right">Storage libre</th>
                                    <th className="px-3 py-2 text-right">RAM usada</th>
                                    <th className="px-3 py-2 text-left">Conexión</th>
                                    <th className="px-3 py-2 text-left">IP</th>
                                    <th className="px-3 py-2 text-center">Pantalla</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map(row => (
                                    <tr key={row.id}
                                        className="border-b border-gray-800/50 last:border-0
                      hover:bg-gray-800/30 transition-colors">
                                        <td className="px-3 py-2 text-gray-400 font-mono">
                                            {fmtTime(row.recordedAt)}
                                        </td>
                                        <td className={`px-3 py-2 text-right font-medium ${batteryColor(row.batteryLevel)}`}>
                                            {row.batteryLevel !== null ? `${row.batteryLevel}%` : '—'}
                                            {row.batteryCharging && ' ⚡'}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-400">
                                            {row.storageAvailableMB !== null ? `${row.storageAvailableMB} MB` : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-400">
                                            {row.ramUsedMB !== null ? `${row.ramUsedMB} MB` : '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className={`${row.connectionType === 'NONE' ? 'text-red-400' : 'text-emerald-400'
                                                }`}>
                                                {row.connectionType || '—'}
                                            </span>
                                            {row.ssid && (
                                                <span className="text-gray-600 ml-1">({row.ssid})</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-gray-500 font-mono">
                                            {row.ipAddress || '—'}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <span className={`inline-block w-2 h-2 rounded-full ${row.screenOn ? 'bg-emerald-400' : 'bg-gray-600'
                                                }`} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
