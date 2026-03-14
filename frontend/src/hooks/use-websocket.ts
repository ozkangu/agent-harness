"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { WSEvent } from "@/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8420/ws";

type EventHandler = (event: WSEvent) => void;
type WSStatus = "connecting" | "connected" | "disconnected";

export function useWebSocket(onEvent: EventHandler): WSStatus {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handlerRef = useRef(onEvent);
  const [status, setStatus] = useState<WSStatus>("connecting");
  handlerRef.current = onEvent;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setStatus("connecting");

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log("[WS] Connected");
        setStatus("connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WSEvent;
          handlerRef.current(data);
        } catch {
          // ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        console.log("[WS] Disconnected, reconnecting...");
        setStatus("disconnected");
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      setStatus("disconnected");
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return status;
}
