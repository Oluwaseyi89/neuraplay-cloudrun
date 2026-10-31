import { useCallback, useEffect, useRef, useState } from "react";
import { WS_BASE } from "../services/httpClient";
import type { VoiceResult } from "../types/analysis";

const RECONNECT_DELAY_MS = 2000;

interface Options {
  token: string;
  enabled: boolean;
  onAuthenticated: () => void;
  onUnauthorized: () => void;
  onMessage: (data: VoiceResult) => void;
  onDisconnected: (willReconnect: boolean) => void;
}

/** Authenticated voice-analysis WebSocket with automatic reconnect */
export const useVoiceSocket = ({ token, enabled, ...handlers }: Options) => {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled || !token) {
      setIsConnected(false);
      return;
    }

    let disposed = false;
    let unauthorized = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const socket = new WebSocket(`${WS_BASE}/ws/voice-analysis/`);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log("WebSocket connected");
        socket.send(JSON.stringify({ type: "auth", token }));
      };

      socket.onmessage = (event) => {
        const data: VoiceResult = JSON.parse(event.data);
        console.log("WebSocket message:", data);

        if (data.status === "authenticated") {
          setIsConnected(true);
          handlersRef.current.onAuthenticated();
        } else if (data.error === "Unauthorized") {
          unauthorized = true;
          handlersRef.current.onUnauthorized();
        } else {
          handlersRef.current.onMessage(data);
        }
      };

      socket.onclose = (event) => {
        console.log("WebSocket disconnected:", event.code, event.reason);
        if (socketRef.current === socket) {
          socketRef.current = null;
          setIsConnected(false);
        }

        const willReconnect = !disposed && !unauthorized;
        handlersRef.current.onDisconnected(willReconnect);
        if (willReconnect) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [token, enabled]);

  const send = useCallback((payload: object) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const isOpen = useCallback(() => socketRef.current?.readyState === WebSocket.OPEN, []);

  return { isConnected, send, isOpen };
};
