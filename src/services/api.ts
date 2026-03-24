// Servicio API — MDMServer
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://192.168.123.155:5000';
const API_BASE = `${SERVER_URL}/api/admin`;

// ── Tipos base ────────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
  requestId?: string;
}

// ── Dispositivos ──────────────────────────────────────────────────────────────
export interface DeviceListItem {
  id: number;
  deviceId: string;
  deviceName: string | null;
  model: string | null;
  isActive: boolean;
  isOnline: boolean;
  lastSeen: string | null;
  batteryLevel: number | null;
  kioskModeEnabled: boolean;
  cameraDisabled: boolean;
}

export interface DeviceDetail extends DeviceListItem {
  manufacturer: string | null;
  androidVersion: string | null;
  apiLevel: number | null;
  registeredAt: string | null;
  storageAvailableMB: number | null;
  totalStorageMB: number | null;
  ipAddress: string | null;
  pollCount: number;
  notes: string | null;
  pendingCommandsCount: number;
}

// ── Stats — alineado con SystemStatsDto del backend ──────────────────────────
export interface SystemStats {
  totalDevices: number;
  onlineDevices: number;
  pendingCommands: number;
  executedLast24h: number;
  failedLast24h: number;
  averageBatteryLevel: number;
  serverTime: string;
}

export interface WsStatus {
  onlineViaWebSocket: number;
  connectedDeviceIds: string[];
}

export interface TelemetrySnapshot {
  id: number;
  deviceId: string;
  batteryLevel: number | null;
  batteryCharging: boolean;
  storageAvailableMB: number | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  connectionType: string | null;
  ssid: string | null;
  signalStrength: number | null;
  ipAddress: string | null;
  kioskModeEnabled: boolean;
  screenOn: boolean;
  ramUsedMB: number | null;
  cpuTemp: number | null;
  recordedAt: string;
}

export interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  ipAddress: string | null;
  recordedAt: string;
}

export interface ScreenshotData {
  id: number;
  deviceId: string;
  commandId: number | null;
  imageBase64: string;
  fileSizeKB: number | null;
  takenAt: string;
}

export interface DeviceEvent {
  id: number;
  deviceId: string;
  eventType: string;
  severity: string;
  title: string | null;
  details: string | null;
  commandId: number | null;
  occurredAt: string;
}

// ── Comandos ──────────────────────────────────────────────────────────────────
export interface Command {
  id: number;
  deviceId: string;
  commandType: string;
  parameters: string | null;
  status: string;
  priority: number;
  createdAt: string;
  sentAt: string | null;
  executedAt: string | null;
  expiresAt: string | null;
  result: string | null;
  errorMessage: string | null;
  retryCount: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface SendCommandRequest {
  deviceId: string;
  commandType: string;
  parameters?: string;
  priority?: number;
  expiresInMinutes?: number;
}

export interface SendCommandResponse {
  commandId: number;
  message: string;
}

export interface BulkCommandRequest {
  deviceIds: string[];
  commandType: string;
  parameters?: string;
  priority?: number;
  expiresInMinutes?: number;
}

export interface BulkCommandResult {
  total: number;
  results: {
    deviceId: string;
    success: boolean;
    commandId?: number;
    error?: string;
  }[];
}

export interface Geofence {
  id: number;
  deviceId: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isEntry: boolean;      // alerta al entrar
  isExit: boolean;       // alerta al salir
  isActive: boolean;
  createdAt: string;
}

export interface CreateGeofenceRequest {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isEntry: boolean;
  isExit: boolean;
}

// ── Remote View ──────────────────────────────────────────────────────────────
export interface ScreenshotResult {
  screenshot: string;  // base64 JPEG
  width:      number;
  height:     number;
  sizeKb:     number;
}

export interface RemoteViewSession {
  commandId: number;
  status:    string;
  result:    ScreenshotResult | null;
  takenAt:   string | null;
}


// ── Cliente API ───────────────────────────────────────────────────────────────
class MdmApiService {
  private adminKey = '';

  setAdminKey(key: string) { this.adminKey = key; }
  getAdminKey(): string { return this.adminKey; }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (this.adminKey) headers['X-Admin-Key'] = this.adminKey;

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error || `Error HTTP ${response.status}` };
      }
      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error de conexión',
      };
    }
  }

  // ── Dispositivos ────────────────────────────────────────────────────────────
  getDevices(): Promise<ApiResponse<{ total: number; online: number; devices: DeviceListItem[] }>> {
    return this.request('/devices');
  }

  getDevice(deviceId: string): Promise<ApiResponse<DeviceDetail>> {
    return this.request(`/devices/${encodeURIComponent(deviceId)}`);
  }

  deactivateDevice(deviceId: string): Promise<ApiResponse<void>> {
    return this.request(`/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
  }

  updateNotes(deviceId: string, notes: string): Promise<ApiResponse<void>> {
    return this.request(`/devices/${encodeURIComponent(deviceId)}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    });
  }

  cancelAllPendingCommands(deviceId: string): Promise<ApiResponse<void>> {
    return this.request(`/devices/${encodeURIComponent(deviceId)}/commands/pending`, {
      method: 'DELETE',
    });
  }

  // ── Comandos ────────────────────────────────────────────────────────────────
  getDeviceCommands(
    deviceId: string, page = 1, pageSize = 20
  ): Promise<ApiResponse<PagedResult<Command>>> {
    return this.request(
      `/devices/${encodeURIComponent(deviceId)}/commands?page=${page}&pageSize=${pageSize}`
    );
  }

  sendCommand(request: SendCommandRequest): Promise<ApiResponse<SendCommandResponse>> {
    return this.request('/commands', { method: 'POST', body: JSON.stringify(request) });
  }

  getCommandStatus(commandId: number): Promise<ApiResponse<Command>> {
    return this.request(`/commands/${commandId}`);
  }

  cancelCommand(commandId: number, reason: string): Promise<ApiResponse<void>> {
    return this.request(`/commands/${commandId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  }

  sendBulkCommand(request: BulkCommandRequest): Promise<ApiResponse<BulkCommandResult>> {
    return this.request('/commands/bulk', { method: 'POST', body: JSON.stringify(request) });
  }

  // ── Sistema ─────────────────────────────────────────────────────────────────
  getStats(): Promise<ApiResponse<SystemStats>> {
    return this.request('/stats');
  }

  getWsStatus(): Promise<ApiResponse<WsStatus>> {
    return this.request('/ws-status');
  }

  getTelemetry(
    deviceId: string, hoursBack = 24, maxRows = 100
  ): Promise<ApiResponse<{ count: number; snapshots: TelemetrySnapshot[] }>> {
    return this.request(
      `/devices/${encodeURIComponent(deviceId)}/telemetry?hoursBack=${hoursBack}&maxRows=${maxRows}`
    );
  }

  getLocationHistory(
    deviceId: string, hoursBack = 24
  ): Promise<ApiResponse<{ count: number; points: LocationPoint[] }>> {
    return this.request(
      `/devices/${encodeURIComponent(deviceId)}/location-history?hoursBack=${hoursBack}`
    );
  }
  
  getLatestScreenshot(deviceId: string): Promise<ApiResponse<ScreenshotData>> {
    return this.request(`/devices/${encodeURIComponent(deviceId)}/screenshot`);
  }

  getDeviceEvents(
    deviceId: string, page = 1, pageSize = 50
  ): Promise<ApiResponse<{ events: DeviceEvent[] }>> {
    return this.request(
      `/devices/${encodeURIComponent(deviceId)}/events?page=${page}&pageSize=${pageSize}`
    );
  }
  
  async requestScreenshot(deviceId: string): Promise<ApiResponse<{ commandId: number; message: string }>> {
  return this.request(`/devices/${encodeURIComponent(deviceId)}/screenshot`, {
    method: 'POST',
  });
}

async pollScreenshotResult(commandId: number): Promise<ApiResponse<Command>> {
  return this.request(`/commands/${commandId}`);
}

  // ── Location Tracking ─────────────────────────────────────────────────────────
  startLocationTracking(
    deviceId: string,
    intervalSeconds: number = 1,
    minDistanceMeters: number = 10
  ): Promise<ApiResponse<{ commandId: number; message: string }>> {
    return this.request(
      `/devices/${encodeURIComponent(deviceId)}/location-tracking/start`,
      {
        method: 'POST',
        body: JSON.stringify({ intervalSeconds, minDistanceMeters }),
      }
    );
  }

  stopLocationTracking(deviceId: string): Promise<ApiResponse<{ commandId: number; message: string }>> {
    return this.request(
      `/devices/${encodeURIComponent(deviceId)}/location-tracking/stop`,
      { method: 'POST' }
    );
  }

  // ── Geofences ─────────────────────────────────────────────────────────────────
  getGeofences(deviceId: string): Promise<ApiResponse<Geofence[]>> {
    return this.request(`/devices/${encodeURIComponent(deviceId)}/geofences`);
  }

  createGeofence(deviceId: string, geofence: CreateGeofenceRequest): Promise<ApiResponse<Geofence>> {
    return this.request(
      `/devices/${encodeURIComponent(deviceId)}/geofences`,
      { method: 'POST', body: JSON.stringify(geofence) }
    );
  }

  deleteGeofence(deviceId: string, geofenceId: number): Promise<ApiResponse<void>> {
    return this.request(
      `/devices/${encodeURIComponent(deviceId)}/geofences/${geofenceId}`,
      { method: 'DELETE' }
    );
  }
}

export const api = new MdmApiService();
export default api;