// components/ScreenshotViewer.tsx
import React from 'react';
import { useScreenshot } from '../hooks/useScreenshot';

export const ScreenshotViewer: React.FC<{ deviceId: string; apiKey: string }> = ({
    deviceId,
    apiKey
}) => {
    const { screenshot, loading, error, takeScreenshot, startLiveMode, stopLiveMode } =
        useScreenshot(apiKey);

    return (
        <div className="screenshot-container">
            <div className="controls">
                <button onClick={() => takeScreenshot(deviceId)} disabled={loading}>
                    {loading ? 'Capturando...' : 'Capturar Pantalla'}
                </button>
                <button onClick={() => startLiveMode(deviceId)} disabled={loading}>
                    ▶ Modo Live (2s)
                </button>
                <button onClick={stopLiveMode} disabled={!loading}>
                    ⏹ Detener
                </button>
            </div>

            {error && <div className="error">{error}</div>}

            {screenshot ? (
                <img
                    src={screenshot}
                    alt="Screenshot del dispositivo"
                    style={{ maxWidth: '100%', border: '1px solid #ccc' }}
                />
            ) : (
                <div className="placeholder">Sin imagen</div>
            )}
        </div>
    );
};