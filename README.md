# 🖥️ **Repositorio: mdm-admin-panel**

## 🧠 Descripción General

Panel web administrativo construido con **React + TypeScript + Vite**.
Permite monitorear y controlar dispositivos en tiempo real.

---

## 🎯 Propósito

Interfaz para operadores/admins del sistema MDM.

---

## 🏗️ Arquitectura

Frontend SPA:

```
Pages → Components → Services → API/WebSocket
```

---

## 📁 Estructura

```
/pages
/components
/services
/hooks
/utils
```

---

## 📄 Páginas principales

| Página           | Función               |
| ---------------- | --------------------- |
| DashboardPage    | Resumen general       |
| DevicesPage      | Lista de dispositivos |
| DeviceDetailPage | Detalle individual    |
| CommandsPage     | Envío de comandos     |
| MonitoringPage   | Monitoreo             |
| RemoteViewPage   | Streaming de pantalla |
| GeofencesPage    | Geocercas             |
| LoginPage        | Autenticación         |

---

## 🔄 Flujos clave

### 1. Dashboard

* Consulta API cada 30s
* Muestra métricas globales

---

### 2. Gestión de dispositivos

* Listado desde backend
* Visualización de estado
* Acciones rápidas

---

### 3. Envío de comandos

1. Usuario selecciona dispositivo
2. Se envía request REST
3. Backend lo ejecuta vía WS

---

### 4. Streaming remoto

1. Abre WebSocket `/ws/viewer`
2. Solicita `watch(deviceId)`
3. Recibe chunks H.264
4. Decodifica con Broadway.js
5. Render en `<canvas>`

---

## 📦 Tecnologías

* React
* TypeScript
* Vite
* Broadway.js (decodificador H.264)
* WebSockets

---

## ⚙️ Configuración

Variables típicas:

```
VITE_API_URL=
VITE_WS_URL=
```

---

## ▶️ Ejecución

```bash
npm install
npm run dev
```

---

## ⚠️ Observaciones técnicas

* README actual no documenta el sistema (deberías reemplazarlo)
* Broadway.js implica:

  * dependencia en keyframes
  * posible latencia si no hay IDR frecuente
* Oportunidades:

  * estado global (Zustand/Redux)
  * manejo robusto de reconexión WS
  * control de buffering de video

---

# 🔗 **Arquitectura Global del Sistema**

## 🧩 Componentes

```
[ Admin Panel (React) ]
           ↓
     REST / WebSocket
           ↓
[ ASP.NET Backend ]
           ↓
     WebSocket / REST
           ↓
[ Android Client ]
```

---

## 🔄 Flujo end-to-end

1. Admin envía comando
2. Backend lo registra
3. Se envía vía WebSocket
4. Cliente ejecuta
5. Resultado regresa
6. Panel lo muestra

---

## 📡 Streaming

```
Android → H264 → WS → Backend → WS → React → Canvas
```

---

# 🚨 Problemas potenciales detectados

* Dependencia fuerte en WebSockets (sin fallback)
* Streaming sensible a keyframes (lo que ya detectaste)
* Posible acoplamiento fuerte backend ↔ cliente
* Falta de:

  * retry policies
  * observabilidad avanzada
  * control de sesiones WS

---

# 🚀 Recomendaciones de mejora (nivel arquitecto)

* Introducir **message broker (Redis / RabbitMQ)** para escalar WS
* Implementar **CQRS ligero**
* Añadir **event sourcing parcial** para comandos
* Mejorar streaming:

  * forzar keyframes periódicos
  * buffering inteligente
* Centralizar configuración en `.env`

---
