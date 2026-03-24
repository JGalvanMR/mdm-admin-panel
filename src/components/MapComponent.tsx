import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';
import { Icon, LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix para íconos de Leaflet en Vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = new Icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  recordedAt: string;
}

interface Geofence {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isEntry: boolean;
  isExit: boolean;
  isActive: boolean;
}

interface MapComponentProps {
  locations: LocationPoint[];
  geofences?: Geofence[];
  onMapClick?: (lat: number, lng: number) => void;
  height?: string;
}

// Coordenadas por defecto (Centro de México)
const DEFAULT_CENTER: LatLngTuple = [23.6345, -102.5528];
const DEFAULT_ZOOM = 5;

// Componente para centrar el mapa
function MapCenter({ locations }: { locations: LocationPoint[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (locations && locations.length > 0) {
      const last = locations[0];
      // Validación estricta de coordenadas
      if (typeof last.latitude === 'number' && typeof last.longitude === 'number' &&
          !isNaN(last.latitude) && !isNaN(last.longitude)) {
        map.setView([last.latitude, last.longitude], 15);
      }
    }
  }, [locations, map]);
  
  return null;
}

// Componente para manejar clicks
function MapClickHandler({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
}

export default function MapComponent({ 
  locations = [], 
  geofences = [], 
  onMapClick,
  height = "400px" 
}: MapComponentProps) {
  // Calcular centro válido
  const getValidCenter = (): LatLngTuple => {
    if (locations.length > 0) {
      const first = locations[0];
      if (typeof first.latitude === 'number' && typeof first.longitude === 'number' &&
          !isNaN(first.latitude) && !isNaN(first.longitude)) {
        return [first.latitude, first.longitude];
      }
    }
    // Si hay geofences válidas, usar la primera
    if (geofences.length > 0) {
      const first = geofences[0];
      if (typeof first.latitude === 'number' && typeof first.longitude === 'number' &&
          !isNaN(first.latitude) && !isNaN(first.longitude)) {
        return [first.latitude, first.longitude];
      }
    }
    return DEFAULT_CENTER;
  };

  const center = getValidCenter();
  
  // Filtrar solo ubicaciones válidas
  const validLocations = locations.filter(loc => 
    typeof loc.latitude === 'number' && 
    typeof loc.longitude === 'number' &&
    !isNaN(loc.latitude) && 
    !isNaN(loc.longitude)
  );

  // Filtrar solo geofences válidas
  const validGeofences = geofences.filter(geo => 
    typeof geo.latitude === 'number' && 
    typeof geo.longitude === 'number' &&
    typeof geo.radiusMeters === 'number' &&
    !isNaN(geo.latitude) && 
    !isNaN(geo.longitude) &&
    !isNaN(geo.radiusMeters)
  );

  return (
    <div style={{ height, width: '100%' }} className="relative rounded-xl overflow-hidden border border-gray-800">
      <MapContainer
        center={center}
        zoom={locations.length > 0 ? 15 : DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapCenter locations={validLocations} />
        <MapClickHandler onMapClick={onMapClick} />

        {/* Marcadores de ubicación */}
        {validLocations.map((loc, idx) => (
          <Marker
            key={idx}
            position={[loc.latitude, loc.longitude]}
            icon={DefaultIcon}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">Ubicación #{idx + 1}</p>
                <p className="text-xs text-gray-600">
                  {new Date(loc.recordedAt).toLocaleString('es-ES')}
                </p>
                {loc.accuracy && (
                  <p className="text-xs text-gray-600">
                    Precisión: ±{Math.round(loc.accuracy)}m
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Geofences */}
        {validGeofences.map((geo) => (
          <Circle
            key={geo.id}
            center={[geo.latitude, geo.longitude]}
            radius={geo.radiusMeters}
            pathOptions={{
              color: geo.isActive ? '#10b981' : '#6b7280',
              fillColor: geo.isActive ? '#10b981' : '#6b7280',
              fillOpacity: 0.2,
              weight: 2,
              dashArray: geo.isActive ? undefined : '5, 10'
            }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{geo.name}</p>
                <p className="text-xs text-gray-600">Radio: {geo.radiusMeters}m</p>
                <p className="text-xs">
                  {geo.isEntry && <span className="text-emerald-600">● Entrada</span>}
                  {geo.isExit && <span className="text-red-600">● Salida</span>}
                </p>
              </div>
            </Popup>
          </Circle>
        ))}
      </MapContainer>
    </div>
  );
}