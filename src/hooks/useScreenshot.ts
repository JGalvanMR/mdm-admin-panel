import { useState, useCallback, useRef, useEffect } from 'react';
import api from '../services/api';

export function useScreenshot() {
    const [screenshot, setScreenshot] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isLiveRef = useRef(false);

    const takeScreenshot = useCallback(async (deviceId: string): Promise<string | null> => {
        // Cancelar operación anterior
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setLoading(true);
        setError(null);

        try {
            // 1. Crear comando usando el servicio API existente
            const response = await api.requestScreenshot(deviceId);

            if (!response.success || !response.data) {
                throw new Error(response.error || 'Error solicitando captura');
            }

            const commandId = response.data.commandId;

            // 2. Polling cada 500ms por máximo 15s
            const startTime = Date.now();
            const maxWait = 15000;

            while (Date.now() - startTime < maxWait) {
                if (abortControllerRef.current.signal.aborted) {
                    throw new Error('Cancelado');
                }

                const cmdRes = await api.pollScreenshotResult(commandId);

                if (!cmdRes.success || !cmdRes.data) {
                    await new Promise(r => setTimeout(r, 500));
                    continue;
                }

                const cmd = cmdRes.data;

                if (cmd.status === 'Executed' && cmd.result) {
                    try {
                        const result = JSON.parse(cmd.result);
                        if (result.screenshot) {
                            const imageUrl = `data:image/jpeg;base64,${result.screenshot}`;
                            setScreenshot(imageUrl);
                            setLoading(false);
                            return result.screenshot;
                        }
                    } catch (e) {
                        throw new Error('Respuesta inválida del dispositivo');
                    }
                }

                if (cmd.status === 'Failed') {
                    throw new Error(cmd.errorMessage || 'Falló la captura en el dispositivo');
                }

                if (cmd.status === 'Expired' || cmd.status === 'Cancelled') {
                    throw new Error(`Comando ${cmd.status.toLowerCase()}`);
                }

                await new Promise(r => setTimeout(r, 500));
            }

            throw new Error('Timeout: el dispositivo no respondió en 15 segundos');

        } catch (err: any) {
            if (err.name !== 'AbortError') {
                setError(err.message);
            }
            setLoading(false);
            return null;
        }
    }, []);

    const startLiveMode = useCallback((deviceId: string) => {
        isLiveRef.current = true;

        const loop = async () => {
            if (!isLiveRef.current) return;
            await takeScreenshot(deviceId);
            if (isLiveRef.current) {
                timeoutRef.current = setTimeout(loop, 2000);
            }
        };
        loop();
    }, [takeScreenshot]);

    const stopLiveMode = useCallback(() => {
        isLiveRef.current = false;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (abortControllerRef.current) abortControllerRef.current.abort();
        setLoading(false);
    }, []);

    const clearScreenshot = useCallback(() => {
        setScreenshot(null);
        setError(null);
    }, []);

    // Cleanup al desmontar
    useEffect(() => {
        return () => stopLiveMode();
    }, [stopLiveMode]);

    return {
        screenshot,
        loading,
        error,
        takeScreenshot,
        startLiveMode,
        stopLiveMode,
        clearScreenshot
    };
}