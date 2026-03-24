import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Crosshair, MapPin,
  AlertCircle, CheckCircle2
} from 'lucide-react';
import api, { Geofence, CreateGeofenceRequest } from '../services/api';
import MapComponent from '../components/MapComponent';

export default function GeofencesPage() {
  const { deviceId } = useParams<{ deviceId?: string }>();
  const [devices, setDevices] = useState<{ deviceId: string; deviceName: string | null }[]>([]);
  const [selDevice, setSelDevice] = useState(deviceId || '');
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState<CreateGeofenceRequest>({
    name: '',
    latitude: 0,
    longitude: 0,
    radiusMeters: 100,
    isEntry: true,
    isExit: false
  });

  useEffect(() => {
    api.getDevices().then(r => {
      if (r.success && r.data) {
        setDevices(r.data.devices.map(d => ({
          deviceId: d.deviceId,
          deviceName: d.deviceName,
        })));
        if (!selDevice && r.data.devices.length > 0) setSelDevice(r.data.devices[0].deviceId);
      }
    });
  }, []);

  const loadGeofences = async () => {
    if (!selDevice) return;
    setLoading(true);
    const res = await api.getGeofences(selDevice);
    if (res.success && res.data) setGeofences(res.data);
    setLoading(false);
  };

  useEffect(() => {
    loadGeofences();
  }, [selDevice]);

  const handleMapClick = (lat: number, lng: number) => {
    setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selDevice) return;
    
    const res = await api.createGeofence(selDevice, formData);
    if (res.success) {
      setShowForm(false);
      loadGeofences();
      setFormData({
        name: '',
        latitude: 0,
        longitude: 0,
        radiusMeters: 100,
        isEntry: true,
        isExit: false
      });
    } else {
      alert('Error: ' + res.error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta geofence?')) return;
    const res = await api.deleteGeofence(selDevice, id);
    if (res.success) loadGeofences();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Geofences</h1>
            <p className="text-sm text-gray-400">Cercas virtuales y alertas de ubicación</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 
            text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva Geofence
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={selDevice}
          onChange={e => setSelDevice(e.target.value)}
          className="flex-1 px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm"
        >
          {devices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.deviceName || d.deviceId}
            </option>
          ))}
        </select>
      </div>

      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Nueva Geofence</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Nombre</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  placeholder="Ej: Oficina Principal"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Latitud</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.latitude}
                    onChange={e => setFormData({...formData, latitude: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Longitud</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.longitude}
                    onChange={e => setFormData({...formData, longitude: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Radio (metros)</label>
                <input
                  type="range"
                  min="10"
                  max="1000"
                  step="10"
                  value={formData.radiusMeters}
                  onChange={e => setFormData({...formData, radiusMeters: parseInt(e.target.value)})}
                  className="w-full accent-emerald-500"
                />
                <span className="text-sm text-gray-500">{formData.radiusMeters}m</span>
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={formData.isEntry}
                    onChange={e => setFormData({...formData, isEntry: e.target.checked})}
                    className="accent-emerald-500"
                  />
                  Alertar al entrar
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={formData.isExit}
                    onChange={e => setFormData({...formData, isExit: e.target.checked})}
                    className="accent-emerald-500"
                  />
                  Alertar al salir
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium"
              >
                Crear Geofence
              </button>
            </form>

            <div className="h-64 lg:h-auto">
              <MapComponent
                locations={[]}
                geofences={[{...formData, id: 0, deviceId: selDevice, isActive: true, createdAt: ''}]}
                onMapClick={handleMapClick}
                height="100%"
              />
              <p className="text-xs text-gray-500 mt-2">Haz clic en el mapa para seleccionar ubicación</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {geofences.map(geo => (
          <div key={geo.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold text-white flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-emerald-400" />
                  {geo.name}
                </h4>
                <p className="text-xs text-gray-500 mt-1">
                  {geo.latitude.toFixed(6)}, {geo.longitude.toFixed(6)}
                </p>
                <p className="text-xs text-gray-500">Radio: {geo.radiusMeters}m</p>
              </div>
              <button
                onClick={() => handleDelete(geo.id)}
                className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2 mt-3">
              {geo.isEntry && (
                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Entrada
                </span>
              )}
              {geo.isExit && (
                <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Salida
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}