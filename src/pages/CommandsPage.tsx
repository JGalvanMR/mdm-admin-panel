import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Terminal,
  Send,
  Smartphone,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ChevronDown,
  X,
  Users,
} from 'lucide-react';
import api, { DeviceListItem, SendCommandRequest, BulkCommandResult } from '../services/api';

const COMMAND_TYPES = [
  { value: 'LOCK_DEVICE', label: 'Bloquear Dispositivo', desc: 'Bloquea la pantalla inmediatamente' },
  { value: 'REBOOT_DEVICE', label: 'Reiniciar', desc: 'Reinicia el dispositivo' },
  { value: 'WIPE_DATA', label: 'Borrar Datos', desc: 'Restablece el dispositivo a valores de fábrica', danger: true },
  { value: 'DISABLE_CAMERA', label: 'Deshabilitar Cámara', desc: 'Desactiva la cámara del dispositivo' },
  { value: 'ENABLE_CAMERA', label: 'Habilitar Cámara', desc: 'Activa la cámara del dispositivo' },
  { value: 'ENABLE_KIOSK_MODE', label: 'Activar Kiosk Mode', desc: 'Restringe el dispositivo a una sola app' },
  { value: 'DISABLE_KIOSK_MODE', label: 'Desactivar Kiosk Mode', desc: 'Desbloquea el modo kiosco' },
  { value: 'GET_DEVICE_INFO', label: 'Obtener Info', desc: 'Solicita información del dispositivo' },
  { value: 'SET_SCREEN_TIMEOUT', label: 'Timeout Pantalla', desc: 'Configura el timeout de pantalla', hasParams: true },
  { value: 'INSTALL_APP', label: 'Instalar App', desc: 'Instala una app desde APK', hasParams: true },
  { value: 'UNINSTALL_APP', label: 'Desinstalar App', desc: 'Desinstala una app', hasParams: true },
  { value: 'CLEAR_APP_DATA', label: 'Limpiar Datos App', desc: 'Borra datos de una app', hasParams: true },
  { value: 'SET_VOLUME', label: 'Ajustar Volumen', desc: 'Cambia el nivel de volumen', hasParams: true },
  { value: 'SET_BRIGHTNESS', label: 'Ajustar Brillo', desc: 'Cambia el brillo de pantalla', hasParams: true },
  { value: 'SEND_MESSAGE', label: 'Enviar Mensaje', desc: 'Muestra notificación en dispositivo', hasParams: true },
  { value: 'ENABLE_WIFI', label: 'Activar WiFi', desc: 'Enciende el WiFi' },
  { value: 'DISABLE_WIFI', label: 'Desactivar WiFi', desc: 'Apaga el WiFi' },
];

export default function CommandsPage() {
  const [searchParams] = useSearchParams();
  const preselectedDevice = searchParams.get('device') || '';

  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [selectedDevice, setSelectedDevice] = useState(preselectedDevice);
  const [selectedCommand, setSelectedCommand] = useState('');
  const [parameters, setParameters] = useState('');
  const [priority, setPriority] = useState(5);
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkCommandResult | null>(null);

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    const response = await api.getDevices();
    if (response.success && response.data) {
      setDevices(response.data.devices);
    }
  };

  const handleSendCommand = async () => {
    if (!selectedDevice || !selectedCommand) return;

    setSending(true);
    setResult(null);

    const request: SendCommandRequest = {
      deviceId: selectedDevice,
      commandType: selectedCommand,
      parameters: parameters || undefined,
      priority,
    };

    const response = await api.sendCommand(request);

    setSending(false);
    if (response.success) {
      setResult({
        success: true,
        message: `Comando ${response.data?.commandId ? `#${response.data.commandId}` : ''} enviado exitosamente`,
      });
      setParameters('');
    } else {
      setResult({
        success: false,
        message: response.error || 'Error al enviar comando',
      });
    }
  };

  const handleBulkCommand = async () => {
    if (selectedDevices.length === 0 || !selectedCommand) return;

    setSending(true);
    setBulkResult(null);

    const response = await api.sendBulkCommand({
      deviceIds: selectedDevices,
      commandType: selectedCommand,
      parameters: parameters || undefined,
      priority,
    });

    setSending(false);
    if (response.success && response.data) {
      setBulkResult(response.data);
    } else {
      setResult({
        success: false,
        message: response.error || 'Error al enviar comandos',
      });
    }
  };

  const toggleDeviceSelection = (deviceId: string) => {
    setSelectedDevices((prev) =>
      prev.includes(deviceId)
        ? prev.filter((id) => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  const selectAllDevices = () => {
    if (selectedDevices.length === devices.length) {
      setSelectedDevices([]);
    } else {
      setSelectedDevices(devices.map((d) => d.deviceId));
    }
  };

  const getCommandInfo = () => COMMAND_TYPES.find((c) => c.value === selectedCommand);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Enviar Comandos</h1>
        <p className="text-sm text-gray-400 mt-1">
          Envía comandos a uno o varios dispositivos
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2 p-1 bg-gray-900 rounded-lg w-fit">
        <button
          onClick={() => setMode('single')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'single'
              ? 'bg-emerald-500 text-white'
              : 'text-gray-400 hover:text-white'
            }`}
        >
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            <span>Individual</span>
          </div>
        </button>
        <button
          onClick={() => setMode('bulk')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'bulk'
              ? 'bg-emerald-500 text-white'
              : 'text-gray-400 hover:text-white'
            }`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span>Masivo</span>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Command Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Device Selection */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              {mode === 'single' ? 'Seleccionar Dispositivo' : 'Seleccionar Dispositivos'}
            </h3>

            {mode === 'single' ? (
              <div className="relative">
                <select
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white appearance-none cursor-pointer focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Seleccionar dispositivo...</option>
                  {devices.map((device) => (
                    <option key={device.id} value={device.deviceId}>
                      {device.deviceName || device.deviceId} ({device.model || 'Unknown'})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">
                    {selectedDevices.length} de {devices.length} seleccionados
                  </span>
                  <button
                    onClick={selectAllDevices}
                    className="text-sm text-emerald-400 hover:text-emerald-300"
                  >
                    {selectedDevices.length === devices.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-2 p-3 bg-gray-800/50 rounded-lg">
                  {devices.map((device) => (
                    <label
                      key={device.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDevices.includes(device.deviceId)}
                        onChange={() => toggleDeviceSelection(device.deviceId)}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-gray-900"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {device.deviceName || device.deviceId}
                        </p>
                        <p className="text-xs text-gray-500">
                          {device.model || 'Unknown'}
                        </p>
                      </div>
                      <div
                        className={`w-2 h-2 rounded-full ${device.isOnline ? 'bg-emerald-400' : 'bg-gray-500'
                          }`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Command Selection */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Seleccionar Comando</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {COMMAND_TYPES.map((cmd) => (
                <button
                  key={cmd.value}
                  onClick={() => {
                    setSelectedCommand(cmd.value);
                    setParameters('');
                  }}
                  className={`p-4 rounded-lg border text-left transition-all ${selectedCommand === cmd.value
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : cmd.danger
                        ? 'border-red-500/30 bg-red-500/5 hover:border-red-500/50'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className={`text-sm font-medium ${selectedCommand === cmd.value
                          ? 'text-emerald-400'
                          : cmd.danger
                            ? 'text-red-400'
                            : 'text-white'
                        }`}>
                        {cmd.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{cmd.desc}</p>
                    </div>
                    {cmd.hasParams && (
                      <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded">
                        + params
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          {selectedCommand && getCommandInfo()?.hasParams && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Parámetros (JSON)
              </h3>
              <textarea
                value={parameters}
                onChange={(e) => setParameters(e.target.value)}
                placeholder={getParameterPlaceholder(selectedCommand)}
                rows={4}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white font-mono text-sm placeholder-gray-500 focus:outline-none focus:border-emerald-500 resize-none"
              />
              <p className="text-xs text-gray-500 mt-2">
                Ingresa los parámetros en formato JSON
              </p>
            </div>
          )}

          {/* Priority */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Prioridad</h3>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="1"
                max="10"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value))}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <span className="text-white font-medium w-8">{priority}</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Prioridad más alta = ejecución más rápida
            </p>
          </div>

          {/* Send Button */}
          <button
            onClick={mode === 'single' ? handleSendCommand : handleBulkCommand}
            disabled={
              sending ||
              (mode === 'single' ? !selectedDevice : selectedDevices.length === 0) ||
              !selectedCommand
            }
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {sending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Enviando...</span>
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                <span>
                  {mode === 'single'
                    ? 'Enviar Comando'
                    : `Enviar a ${selectedDevices.length} dispositivo${selectedDevices.length > 1 ? 's' : ''}`}
                </span>
              </>
            )}
          </button>

          {/* Result */}
          {result && (
            <div
              className={`p-4 rounded-xl border ${result.success
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                  : 'bg-red-500/20 border-red-500/50 text-red-400'
                }`}
            >
              <div className="flex items-center gap-3">
                {result.success ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
                <span>{result.message}</span>
              </div>
            </div>
          )}

          {/* Bulk Result */}
          {bulkResult && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Resultado del Envío Masivo
              </h3>
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Total</span>
                  <span className="text-white font-medium">{bulkResult.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Exitosos</span>
                  <span className="text-emerald-400 font-medium">
                    {bulkResult.results.filter((r) => r.success).length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Fallidos</span>
                  <span className="text-red-400 font-medium">
                    {bulkResult.results.filter((r) => !r.success).length}
                  </span>
                </div>
              </div>
              {bulkResult.results.some((r) => !r.success) && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <p className="text-sm text-red-400 mb-2">Dispositivos con error:</p>
                  <div className="space-y-1">
                    {bulkResult.results
                      .filter((r) => !r.success)
                      .map((r) => (
                        <p key={r.deviceId} className="text-xs text-gray-500">
                          {r.deviceId}: {r.error}
                        </p>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Command Info Sidebar */}
        <div className="space-y-6">
          {selectedCommand ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 sticky top-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Comando Seleccionado
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1">Tipo</p>
                  <code className="text-sm text-emerald-400 font-mono">
                    {selectedCommand}
                  </code>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1">Descripción</p>
                  <p className="text-sm text-gray-300">
                    {getCommandInfo()?.desc}
                  </p>
                </div>
                {getCommandInfo()?.danger && (
                  <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                    <div className="flex items-center gap-2 text-red-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm font-medium">Comando Peligroso</span>
                    </div>
                    <p className="text-xs text-red-400/80 mt-1">
                      Este comando puede causar pérdida de datos
                    </p>
                  </div>
                )}
                {getCommandInfo()?.hasParams && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase mb-1">
                      Formato de Parámetros
                    </p>
                    <pre className="text-xs text-gray-400 bg-gray-800 p-3 rounded-lg overflow-x-auto">
                      {getParameterExample(selectedCommand)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
              <Terminal className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p className="text-gray-400">
                Selecciona un comando para ver más información
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getParameterPlaceholder(commandType: string): string {
  switch (commandType) {
    case 'SET_SCREEN_TIMEOUT':
      return '{"seconds": 60}';
    case 'INSTALL_APP':
      return '{"url": "https://...", "packageName": "com.example.app"}';
    case 'UNINSTALL_APP':
    case 'CLEAR_APP_DATA':
      return '{"packageName": "com.example.app"}';
    case 'SET_VOLUME':
      return '{"level": 50}';
    case 'SET_BRIGHTNESS':
      return '{"level": 128}';
    case 'SEND_MESSAGE':
      return '{"title": "Alerta", "body": "Mensaje del administrador"}';
    default:
      return '';
  }
}

function getParameterExample(commandType: string): string {
  switch (commandType) {
    case 'SET_SCREEN_TIMEOUT':
      return `{
  "seconds": 60  // 5-3600
}`;
    case 'INSTALL_APP':
      return `{
  "url": "https://servidor/app.apk",
  "packageName": "com.example.app"
}`;
    case 'UNINSTALL_APP':
    case 'CLEAR_APP_DATA':
      return `{
  "packageName": "com.example.app"
}`;
    case 'SET_VOLUME':
      return `{
  "level": 50  // 0-100
}`;
    case 'SET_BRIGHTNESS':
      return `{
  "level": 128  // 0-255
}`;
    case 'SEND_MESSAGE':
      return `{
  "title": "Alerta",
  "body": "Mensaje importante"
}`;
    default:
      return '{}';
  }
}
