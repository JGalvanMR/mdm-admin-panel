// Servicio API para conectar con MDMServer
// Configuración del servidor MDM

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://192.168.123.155:5000';
const API_BASE = `${SERVER_URL}/api/admin`;

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
  requestId?: string;
}

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

export interface SystemStats {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  commandsSent: number;
  commandsExecuted: number;
  commandsFailed: number;
  averageBatteryLevel: number;
}

export interface WsStatus {
  onlineViaWebSocket: number;
  connectedDeviceIds: string[];
}

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

class MdmApiService {
  private adminKey: string = '';

  setAdminKey(key: string) {
    this.adminKey = key;
  }

  getAdminKey(): string {
    return this.adminKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.adminKey) {
      headers['X-Admin-Key'] = this.adminKey;
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `Error HTTP ${response.status}`,
        };
      }

      return data;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error de conexión',
      };
    }
  }

  // ── Dispositivos ──────────────────────────────────────────

  async getDevices(): Promise<ApiResponse<{ total: number; online: number; devices: DeviceListItem[] }>> {
    return this.request('/devices');
  }

  async getDevice(deviceId: string): Promise<ApiResponse<DeviceDetail>> {
    return this.request(`/devices/${encodeURIComponent(deviceId)}`);
  }

  async deactivateDevice(deviceId: string): Promise<ApiResponse<void>> {
    return this.request(`/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
  }

  async updateNotes(deviceId: string, notes: string): Promise<ApiResponse<void>> {
    return this.request(`/devices/${encodeURIComponent(deviceId)}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    });
  }

  async cancelAllPendingCommands(deviceId: string): Promise<ApiResponse<void>> {
    return this.request(`/devices/${encodeURIComponent(deviceId)}/commands/pending`, {
      method: 'DELETE',
    });
  }

  // ── Comandos ──────────────────────────────────────────────

  async getDeviceCommands(
    deviceId: string,
    page = 1,
    pageSize = 20
  ): Promise<ApiResponse<PagedResult<Command>>> {
    return this.request(
      `/devices/${encodeURIComponent(deviceId)}/commands?page=${page}&pageSize=${pageSize}`
    );
  }

  async sendCommand(request: SendCommandRequest): Promise<ApiResponse<SendCommandResponse>> {
    return this.request('/commands', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getCommandStatus(commandId: number): Promise<ApiResponse<Command>> {
    return this.request(`/commands/${commandId}`);
  }

  async cancelCommand(commandId: number, reason: string): Promise<ApiResponse<void>> {
    return this.request(`/commands/${commandId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  }

  async sendBulkCommand(request: BulkCommandRequest): Promise<ApiResponse<BulkCommandResult>> {
    return this.request('/commands/bulk', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // ── Sistema ────────────────────────────────────────────────

  async getStats(): Promise<ApiResponse<SystemStats>> {
    return this.request('/stats');
  }

  async getWsStatus(): Promise<ApiResponse<WsStatus>> {
    return this.request('/ws-status');
  }
}

export const api = new MdmApiService();
export default api;
