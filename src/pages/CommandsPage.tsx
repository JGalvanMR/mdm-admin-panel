import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Terminal, Send, Smartphone, AlertTriangle,
  CheckCircle, Loader2, ChevronDown, Users, Info,
} from 'lucide-react';
import api, { DeviceListItem, SendCommandRequest, BulkCommandResult } from '../services/api';

// ── Definición completa de los 22 comandos ────────────────────────────────────
interface CommandDef {
  value: string;
  label: string;
  desc: string;
  hasParams?: boolean;
  danger?: boolean;
  autoConfirm?: boolean;   // inyecta {"confirm":true} automáticamente
  group: string;
}

const COMMAND_TYPES: CommandDef[] = [
  // Dispositivo
  { group: 'Dispositivo', value: 'LOCK_DEVICE', label: 'Bloquear Pantalla', desc: 'Bloquea la pantalla inmediatamente' },
  { group: 'Dispositivo', value: 'WAKE_SCREEN',  label: 'Encender Pantalla', desc: 'Enciende la pantalla remotamente (sin PIN)' },  // ← agregar
  { group: 'Dispositivo', value: 'REBOOT_DEVICE', label: 'Reiniciar', desc: 'Reinicia el dispositivo', danger: true, autoConfirm: true },
  { group: 'Dispositivo', value: 'WIPE_DATA', label: 'Borrar Datos (Factory)', desc: 'Restablece a valores de fábrica', danger: true, autoConfirm: true },
  { group: 'Dispositivo', value: 'GET_DEVICE_INFO', label: 'Obtener Info', desc: 'Solicita información completa del dispositivo' },
  { group: 'Dispositivo', value: 'SET_SCREEN_TIMEOUT', label: 'Timeout Pantalla', desc: 'Configura el timeout de pantalla (5–3600s)', hasParams: true },

  // Cámara y Kiosk
  { group: 'Cámara / Kiosk', value: 'DISABLE_CAMERA', label: 'Deshabilitar Cámara', desc: 'Desactiva la cámara vía DevicePolicyManager' },
  { group: 'Cámara / Kiosk', value: 'ENABLE_CAMERA', label: 'Habilitar Cámara', desc: 'Reactiva la cámara del dispositivo' },
  { group: 'Cámara / Kiosk', value: 'ENABLE_KIOSK_MODE', label: 'Activar Kiosk Mode', desc: 'Bloquea el dispositivo a una sola app' },
  { group: 'Cámara / Kiosk', value: 'DISABLE_KIOSK_MODE', label: 'Desactivar Kiosk Mode', desc: 'Sale del modo kiosco' },

  // Apps
  { group: 'Apps', value: 'LIST_APPS', label: 'Listar Apps', desc: 'Lista todas las apps del usuario instaladas' },
  { group: 'Apps', value: 'INSTALL_APP', label: 'Instalar App', desc: 'Descarga e instala APK silenciosamente', hasParams: true },
  { group: 'Apps', value: 'UNINSTALL_APP', label: 'Desinstalar App', desc: 'Desinstala una app', hasParams: true, danger: true },
  { group: 'Apps', value: 'CLEAR_APP_DATA', label: 'Limpiar Datos App', desc: 'Borra datos y caché de una app', hasParams: true, danger: true },

  // Red
  { group: 'Red', value: 'ENABLE_WIFI', label: 'Activar WiFi', desc: 'Enciende el WiFi' },
  { group: 'Red', value: 'DISABLE_WIFI', label: 'Desactivar WiFi', desc: 'Apaga el WiFi' },
  { group: 'Red', value: 'SET_WIFI_CONFIG', label: 'Configurar WiFi', desc: 'Conecta a una red WiFi específica', hasParams: true },
  { group: 'Red', value: 'ENABLE_BLUETOOTH', label: 'Activar Bluetooth', desc: 'Enciende el Bluetooth' },
  { group: 'Red', value: 'DISABLE_BLUETOOTH', label: 'Desactivar Bluetooth', desc: 'Apaga el Bluetooth' },

  // Sistema
  { group: 'Sistema', value: 'SET_VOLUME', label: 'Ajustar Volumen', desc: 'Cambia el volumen (0–100)', hasParams: true },
  { group: 'Sistema', value: 'SET_BRIGHTNESS', label: 'Ajustar Brillo', desc: 'Cambia el brillo de pantalla (0–255)', hasParams: true },
  { group: 'Sistema', value: 'GET_LOCATION', label: 'Obtener Ubicación', desc: 'Retorna la última ubicación GPS conocida' },
  { group: 'Sistema', value: 'SEND_MESSAGE', label: 'Enviar Mensaje', desc: 'Muestra notificación en el dispositivo', hasParams: true },
];

// Agrupar para mostrar en la UI
const GROUPS = Array.from(new Set(COMMAND_TYPES.map(c => c.group)));

// Placeholders exactos por comando
function getPlaceholder(cmd: string): string {
  switch (cmd) {
    case 'SET_SCREEN_TIMEOUT': return '{"seconds": 60}';
    case 'INSTALL_APP': return '{"url": "https://servidor/app.apk", "packageName": "com.ejemplo.app"}';
    case 'UNINSTALL_APP': return '{"packageName": "com.ejemplo.app"}';
    case 'CLEAR_APP_DATA': return '{"packageName": "com.ejemplo.app"}';
    case 'SET_WIFI_CONFIG': return '{"ssid": "MiRed", "password": "clave123", "security": "WPA2"}';
    case 'SET_VOLUME': return '{"level": 50}';
    case 'SET_BRIGHTNESS': return '{"level": 128}';
    case 'SEND_MESSAGE': return '{"title": "Aviso", "body": "Regresa a tu estación", "urgent": false}';
    default: return '';
  }
}

function getParamExample(cmd: string): string {
  switch (cmd) {
    case 'SET_SCREEN_TIMEOUT': return `{\n  "seconds": 60   // 5 a 3600\n}`;
    case 'INSTALL_APP': return `{\n  "url": "https://servidor/app.apk",\n  "packageName": "com.ejemplo.app"\n}`;
    case 'UNINSTALL_APP': return `{\n  "packageName": "com.ejemplo.app"\n}`;
    case 'CLEAR_APP_DATA': return `{\n  "packageName": "com.ejemplo.app"\n}`;
    case 'SET_WIFI_CONFIG': return `{\n  "ssid": "MiRed",\n  "password": "clave123",\n  "security": "WPA2"  // WPA2 | WPA | OPEN\n}`;
    case 'SET_VOLUME': return `{\n  "level": 50   // 0 a 100\n}`;
    case 'SET_BRIGHTNESS': return `{\n  "level": 128   // 0 a 255\n}`;
    case 'SEND_MESSAGE': return `{\n  "title": "Aviso",\n  "body": "Texto del mensaje",\n  "urgent": false   // true = pantalla completa\n}`;
    default: return '{}';
  }
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CommandsPage() {
  const [searchParams] = useSearchParams();
  const preDevice = searchParams.get('device') || '';

  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [selectedDevice, setSelectedDevice] = useState(preDevice);
  const [selectedCmd, setSelectedCmd] = useState('');
  const [parameters, setParameters] = useState('');
  const [priority, setPriority] = useState(5);
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkCommandResult | null>(null);

  useEffect(() => {
    api.getDevices().then(res => {
      if (res.success && res.data) setDevices(res.data.devices);
    });
  }, []);

  // Limpiar resultado y parámetros al cambiar de comando
  const selectCommand = (cmd: string) => {
    setSelectedCmd(cmd);
    setParameters('');
    setResult(null);
    setBulkResult(null);
  };

  const cmdInfo = COMMAND_TYPES.find(c => c.value === selectedCmd);

  // Construir el JSON de parameters final:
  // - comandos con autoConfirm → inyectar {"confirm":true} siempre
  // - comandos con hasParams   → usar lo que escribió el usuario
  const buildParameters = (): string | undefined => {
    if (cmdInfo?.autoConfirm) return JSON.stringify({ confirm: true });
    if (!cmdInfo?.hasParams) return undefined;
    return parameters.trim() || undefined;
  };

  const handleSend = async () => {
    if (!selectedCmd) return;
    if (mode === 'single' && !selectedDevice) return;
    if (mode === 'bulk' && selectedDevices.length === 0) return;

    setSending(true);
    setResult(null);
    setBulkResult(null);

    const params = buildParameters();

    if (mode === 'single') {
      const req: SendCommandRequest = {
        deviceId: selectedDevice,
        commandType: selectedCmd,
        parameters: params,
        priority,
      };
      const res = await api.sendCommand(req);
      setSending(false);
      setResult({
        success: res.success,
        message: res.success
          ? `Comando #${res.data?.commandId} enviado — ${res.data?.message}`
          : res.error || 'Error al enviar comando',
      });
      if (res.success && cmdInfo?.hasParams) setParameters('');
    } else {
      const res = await api.sendBulkCommand({
        deviceIds: selectedDevices,
        commandType: selectedCmd,
        parameters: params,
        priority,
      });
      setSending(false);
      if (res.success && res.data) setBulkResult(res.data);
      else setResult({ success: false, message: res.error || 'Error en bulk' });
    }
  };

  const toggleDevice = (id: string) =>
    setSelectedDevices(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );

  const selectAll = () =>
    setSelectedDevices(
      selectedDevices.length === devices.length ? [] : devices.map(d => d.deviceId)
    );

  return (
    <div className="space-y-6">

      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-white">Enviar Comandos</h1>
        <p className="text-sm text-gray-400 mt-1">
          {COMMAND_TYPES.length} comandos disponibles · individual o masivo
        </p>
      </div>

      {/* Toggle individual / masivo */}
      <div className="flex gap-1 p-1 bg-gray-900 rounded-lg w-fit">
        {(['single', 'bulk'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === m ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
          >
            {m === 'single' ? <Smartphone className="w-4 h-4" /> : <Users className="w-4 h-4" />}
            {m === 'single' ? 'Individual' : 'Masivo'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Columna izquierda */}
        <div className="lg:col-span-2 space-y-6">

          {/* Selección de dispositivo */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-base font-semibold text-white mb-4">
              {mode === 'single' ? 'Dispositivo' : 'Dispositivos'}
            </h3>

            {mode === 'single' ? (
              <div className="relative">
                <select
                  value={selectedDevice}
                  onChange={e => setSelectedDevice(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg
                    text-white appearance-none cursor-pointer focus:outline-none
                    focus:border-emerald-500 text-sm"
                >
                  <option value="">Seleccionar dispositivo…</option>
                  {devices.map(d => (
                    <option key={d.id} value={d.deviceId}>
                      {d.deviceName || d.deviceId}
                      {d.model ? ` — ${d.model}` : ''}
                      {d.isOnline ? ' ●' : ' ○'}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4
                  text-gray-500 pointer-events-none" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">
                    {selectedDevices.length} de {devices.length} seleccionados
                  </span>
                  <button
                    onClick={selectAll}
                    className="text-emerald-400 hover:text-emerald-300 text-xs"
                  >
                    {selectedDevices.length === devices.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1 p-2
                  bg-gray-800/50 rounded-lg border border-gray-700">
                  {devices.map(d => (
                    <label
                      key={d.id}
                      className="flex items-center gap-3 p-2 rounded-lg
                        hover:bg-gray-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDevices.includes(d.deviceId)}
                        onChange={() => toggleDevice(d.deviceId)}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700
                          accent-emerald-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {d.deviceName || d.deviceId}
                        </p>
                        <p className="text-xs text-gray-500">{d.model || '—'}</p>
                      </div>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${d.isOnline ? 'bg-emerald-400' : 'bg-gray-600'
                        }`} />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Selección de comando — agrupado */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-base font-semibold text-white mb-4">Comando</h3>
            <div className="space-y-5">
              {GROUPS.map(group => (
                <div key={group}>
                  <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">
                    {group}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {COMMAND_TYPES.filter(c => c.group === group).map(cmd => (
                      <button
                        key={cmd.value}
                        onClick={() => selectCommand(cmd.value)}
                        className={`p-3 rounded-lg border text-left transition-all ${selectedCmd === cmd.value
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : cmd.danger
                              ? 'border-red-500/30 bg-red-500/5 hover:border-red-500/50'
                              : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
                          }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate ${selectedCmd === cmd.value
                                ? 'text-emerald-400'
                                : cmd.danger ? 'text-red-400' : 'text-white'
                              }`}>
                              {cmd.label}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                              {cmd.desc}
                            </p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            {cmd.hasParams && (
                              <span className="text-xs text-gray-500 bg-gray-700
                                px-1.5 py-0.5 rounded">
                                params
                              </span>
                            )}
                            {cmd.danger && (
                              <span className="text-xs text-red-500 bg-red-500/10
                                px-1.5 py-0.5 rounded">
                                ⚠
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Parámetros — solo para comandos que los necesitan y no son autoConfirm */}
          {cmdInfo?.hasParams && !cmdInfo.autoConfirm && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-base font-semibold text-white mb-1">Parámetros (JSON)</h3>
              <p className="text-xs text-gray-500 mb-3">
                Formato: <code className="text-emerald-400">{getPlaceholder(selectedCmd)}</code>
              </p>
              <textarea
                value={parameters}
                onChange={e => setParameters(e.target.value)}
                placeholder={getPlaceholder(selectedCmd)}
                rows={4}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg
                  text-white font-mono text-sm placeholder-gray-600
                  focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>
          )}

          {/* Info para comandos destructivos con autoConfirm */}
          {cmdInfo?.autoConfirm && (
            <div className="flex items-start gap-3 p-4 bg-amber-500/10 border
              border-amber-500/30 rounded-xl">
              <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-400">Confirmación automática</p>
                <p className="text-xs text-amber-400/70 mt-1">
                  Este comando requiere <code>{"\"confirm\":true"}</code> en el backend.
                  El panel lo inyecta automáticamente — no necesitas escribir parámetros.
                </p>
              </div>
            </div>
          )}

          {/* Prioridad */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-white">Prioridad</h3>
              <span className={`text-sm font-bold px-2 py-0.5 rounded ${priority <= 3 ? 'text-red-400 bg-red-500/20'
                  : priority <= 6 ? 'text-amber-400 bg-amber-500/20'
                    : 'text-gray-400 bg-gray-700'
                }`}>
                {priority <= 3 ? `Alta (${priority})` : priority <= 6 ? `Media (${priority})` : `Baja (${priority})`}
              </span>
            </div>
            <input
              type="range" min="1" max="10" value={priority}
              onChange={e => setPriority(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none
                cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>1 — Urgente</span>
              <span>10 — Normal</span>
            </div>
          </div>

          {/* Botón enviar */}
          <button
            onClick={handleSend}
            disabled={
              sending ||
              !selectedCmd ||
              (mode === 'single' ? !selectedDevice : selectedDevices.length === 0)
            }
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-600
              disabled:bg-emerald-500/30 disabled:cursor-not-allowed
              text-white font-semibold rounded-xl transition-colors
              flex items-center justify-center gap-2 text-sm"
          >
            {sending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                {mode === 'single'
                  ? 'Enviar Comando'
                  : `Enviar a ${selectedDevices.length} dispositivo${selectedDevices.length !== 1 ? 's' : ''}`}
              </>
            )}
          </button>

          {/* Resultado individual */}
          {result && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 ${result.success
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                : 'bg-red-500/10 border-red-500/40 text-red-400'
              }`}>
              {result.success
                ? <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                : <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
              <span className="text-sm">{result.message}</span>
            </div>
          )}

          {/* Resultado bulk */}
          {bulkResult && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-semibold text-white">Resultado masivo</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-white">{bulkResult.total}</p>
                  <p className="text-xs text-gray-500">Total</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-400">
                    {bulkResult.results.filter(r => r.success).length}
                  </p>
                  <p className="text-xs text-gray-500">Exitosos</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-400">
                    {bulkResult.results.filter(r => !r.success).length}
                  </p>
                  <p className="text-xs text-gray-500">Fallidos</p>
                </div>
              </div>
              {bulkResult.results.some(r => !r.success) && (
                <div className="pt-4 border-t border-gray-800">
                  <p className="text-xs text-red-400 mb-2">Errores:</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {bulkResult.results.filter(r => !r.success).map(r => (
                      <p key={r.deviceId} className="text-xs text-gray-500 font-mono">
                        {r.deviceId.substring(0, 16)}… → {r.error}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar — info del comando seleccionado */}
        <div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 sticky top-6">
            {selectedCmd && cmdInfo ? (
              <div className="space-y-5">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Comando</p>
                  <code className="text-emerald-400 font-mono text-sm break-all">
                    {selectedCmd}
                  </code>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Grupo</p>
                  <p className="text-sm text-gray-300">{cmdInfo.group}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Descripción</p>
                  <p className="text-sm text-gray-300">{cmdInfo.desc}</p>
                </div>

                {cmdInfo.danger && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <div className="flex items-center gap-2 text-red-400 mb-1">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-xs font-semibold">Comando destructivo</span>
                    </div>
                    <p className="text-xs text-red-400/70">
                      Esta acción puede causar pérdida de datos o afectar
                      la operación del dispositivo.
                    </p>
                  </div>
                )}

                {cmdInfo.hasParams && !cmdInfo.autoConfirm && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                      Formato esperado
                    </p>
                    <pre className="text-xs text-gray-400 bg-gray-800 p-3 rounded-lg
                      overflow-x-auto leading-relaxed">
                      {getParamExample(selectedCmd)}
                    </pre>
                  </div>
                )}

                <div className="pt-3 border-t border-gray-800 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Requiere Device Owner</span>
                    <span className={
                      ['GET_DEVICE_INFO', 'LIST_APPS', 'SEND_MESSAGE'].includes(selectedCmd)
                        ? 'text-gray-400' : 'text-amber-400'
                    }>
                      {['GET_DEVICE_INFO', 'LIST_APPS', 'SEND_MESSAGE'].includes(selectedCmd)
                        ? 'No' : 'Sí'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Parámetros</span>
                    <span className="text-gray-400">
                      {cmdInfo.autoConfirm ? 'Auto (confirm)' : cmdInfo.hasParams ? 'Requeridos' : 'Ninguno'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Terminal className="w-12 h-12 mx-auto mb-3 text-gray-700" />
                <p className="text-sm text-gray-500">
                  Selecciona un comando para ver su descripción y formato de parámetros
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
