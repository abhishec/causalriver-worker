import { logger } from "@/lib/logger";
/**
 * OpenClaw Gateway Connection Manager
 * ====================================
 *
 * Server-side library for Next.js API routes to communicate with OpenClaw
 * Gateway daemons running on customer machines.
 *
 * Architecture:
 *   - GatewayConnection: single WebSocket connection to one customer gateway
 *   - GatewayManager:    manages connections to MULTIPLE customer gateways (singleton)
 *   - triggerOpenClawAgent: high-level async iterator for copilot -> OpenClaw agent relay
 *
 * Protocol (WebSocket on ws://host:18789):
 *   - Frame types: req (client->server), res (server->client), event (server->client push)
 *   - First frame must be: { type: "connect", params: { auth: { token: "..." } } }
 *   - RPC: { type: "req", id: "uuid", method: "chat.send", params: {...} }
 *   - Response: { type: "res", id: "uuid", ok: true, payload: {...} }
 *   - Events: { type: "event", event: "agent", payload: {...}, seq: number }
 *   - Webhook fallback: POST /hooks/agent with Bearer token
 *
 * Usage:
 *   import { gatewayManager, triggerOpenClawAgent } from '@/lib/openclaw/gateway-client';
 *
 *   // Register a customer gateway
 *   await gatewayManager.registerGateway('org_abc', {
 *     gatewayUrl: 'wss://customer.example.com:18789',
 *     authToken: 'tok_...',
 *     orgId: 'org_abc',
 *   });
 *
 *   // Stream agent responses in an API route
 *   for await (const event of triggerOpenClawAgent({ orgId: 'org_abc', message: 'Analyze churn' })) {
 *     controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
 *   }
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GatewayConfig {
  gatewayUrl: string;       // wss://customer-gateway.example.com or ws://127.0.0.1:18789
  authToken: string;        // Bearer token for auth
  orgId: string;
  webhookUrl?: string;      // Fallback: POST /hooks/agent URL
  webhookToken?: string;    // Separate token for webhook auth
}

export interface GatewayStatus {
  orgId: string;
  connected: boolean;
  lastSeen: Date | null;
  reconnecting: boolean;
  servicesRunning: string[];  // IDs of registered services (from plugin)
  error?: string;
}

export interface OpenClawEvent {
  type: string;        // 'chat', 'agent', 'presence', etc.
  payload: unknown;
  seq?: number;
}

/** SSE-compatible events yielded by triggerOpenClawAgent */
export type AgentStreamEvent =
  | { text: string }
  | { agentStep: AgentStep }
  | { agentStatus: { taskId: string; status: string; message?: string } }
  | { error: string }
  | '[DONE]';

export interface AgentStep {
  stepNumber: number;
  type: 'thinking' | 'querying' | 'acting' | 'observing' | 'reflecting';
  title: string;
  content?: string;
  toolName?: string;
  durationMs?: number;
  status: 'started' | 'completed' | 'failed';
}

export interface TriggerOpenClawParams {
  orgId: string;
  message: string;
  sessionKey?: string;
  agentId?: string;
  model?: string;
}

// ---------------------------------------------------------------------------
// Internal protocol frame types
// ---------------------------------------------------------------------------

interface ConnectFrame {
  type: 'connect';
  params: { auth: { token: string } };
}

interface RequestFrame {
  type: 'req';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface ResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
}

interface EventFrame {
  type: 'event';
  event: string;
  payload: unknown;
  seq?: number;
}

type InboundFrame =
  | ResponseFrame
  | EventFrame
  | { type: 'connected'; payload?: { services?: string[] } };

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const LOG_PREFIX = '[openclaw-gateway]';

function log(
  level: 'info' | 'warn' | 'error' | 'debug',
  msg: string,
  meta?: Record<string, unknown>,
): void {
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  if (level === 'error') {
    logger.error(`${LOG_PREFIX} ${msg}${metaStr}`);
  } else if (level === 'warn') {
    logger.warn(`${LOG_PREFIX} ${msg}${metaStr}`);
  } else if (level === 'debug') {
    if (process.env.NODE_ENV === 'development') {
      logger.debug(`${LOG_PREFIX} [debug] ${msg}${metaStr}`);
    }
  } else {
    logger.debug(`${LOG_PREFIX} ${msg}${metaStr}`);
  }
}

// ---------------------------------------------------------------------------
// WebSocket abstraction (Node.js 'ws' vs browser native)
// ---------------------------------------------------------------------------

type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(event: string, handler: (...args: any[]) => void): void;
  removeEventListener(event: string, handler: (...args: any[]) => void): void;
};

const WS_OPEN = 1;
const WS_CLOSING = 2;
const WS_CLOSED = 3;

/**
 * Create a WebSocket connection. Uses native globalThis.WebSocket if available,
 * otherwise dynamically imports the 'ws' package for Node.js server-side usage.
 */
async function createWebSocket(url: string): Promise<WebSocketLike> {
  if (typeof globalThis.WebSocket !== 'undefined') {
    return new globalThis.WebSocket(url) as unknown as WebSocketLike;
  }
  // Node.js: dynamically import 'ws'
  const wsModule = await import('ws');
  const WS = (wsModule as any).default || (wsModule as any);
  return new WS(url) as unknown as WebSocketLike;
}

// ---------------------------------------------------------------------------
// UUID generator (zero external deps)
// ---------------------------------------------------------------------------

function uuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for older Node.js runtimes
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default RPC timeout in milliseconds */
const RPC_TIMEOUT_MS = 30_000;

/** Auth handshake timeout */
const AUTH_TIMEOUT_MS = 15_000;

/** Heartbeat interval -- ping every 25s to keep the connection alive */
const HEARTBEAT_INTERVAL_MS = 25_000;

/** Max reconnect attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 12;

/** Base delay for exponential backoff (ms) */
const RECONNECT_BASE_DELAY_MS = 1_000;

/** Max delay cap for exponential backoff (ms) */
const RECONNECT_MAX_DELAY_MS = 60_000;

/** Webhook request timeout */
const WEBHOOK_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// GatewayConnection
// ---------------------------------------------------------------------------

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class GatewayConnection {
  private ws: WebSocketLike | null = null;
  private config: GatewayConfig;
  private pendingRequests = new Map<string, PendingRequest>();
  private eventHandlers = new Set<(event: OpenClawEvent) => void>();
  private _connected = false;
  private _reconnecting = false;
  private _destroyed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastSeen: Date | null = null;
  private servicesRunning: string[] = [];
  private lastError: string | undefined;

  constructor(config: GatewayConfig) {
    this.config = { ...config };
  }

  // ---- Public API --------------------------------------------------------

  /**
   * Open the WebSocket, send the connect frame, and wait for the server ack.
   * Rejects if the connection fails or the auth handshake times out.
   */
  async connect(): Promise<void> {
    if (this._destroyed) throw new Error('Connection has been destroyed');
    if (this._connected) return;

    await this._openAndAuth();
    this.reconnectAttempts = 0;
    this._reconnecting = false;
    this.startHeartbeat();
    log('info', `Connected to gateway`, {
      orgId: this.config.orgId,
      url: this.config.gatewayUrl,
    });
  }

  /**
   * Graceful close. Stops heartbeat, clears pending requests, closes WS.
   */
  async disconnect(): Promise<void> {
    this._destroyed = true;
    this._reconnecting = false;
    this.stopHeartbeat();
    this.cancelReconnect();
    this.rejectAllPending(new Error('Connection closed by client'));

    if (
      this.ws &&
      this.ws.readyState !== WS_CLOSED &&
      this.ws.readyState !== WS_CLOSING
    ) {
      this.ws.close(1000, 'Client disconnect');
    }
    this.ws = null;
    this._connected = false;
    log('info', `Disconnected from gateway`, { orgId: this.config.orgId });
  }

  /**
   * Send an RPC request and wait for the matching response.
   * Rejects with timeout after RPC_TIMEOUT_MS (30s).
   */
  async send(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (!this._connected || !this.ws || this.ws.readyState !== WS_OPEN) {
      throw new Error(
        `Cannot send RPC: WebSocket not connected (org: ${this.config.orgId})`,
      );
    }

    const id = uuid();

    const frame: RequestFrame = {
      type: 'req',
      id,
      method,
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new Error(
            `RPC timeout after ${RPC_TIMEOUT_MS}ms: ${method} (id: ${id})`,
          ),
        );
      }, RPC_TIMEOUT_MS);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.ws!.send(JSON.stringify(frame));
      log('debug', `RPC sent: ${method}`, { id, orgId: this.config.orgId });
    });
  }

  /**
   * Subscribe to server-push events. Returns an unsubscribe function.
   */
  onEvent(handler: (event: OpenClawEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  /**
   * Returns true if the WebSocket is open and authenticated.
   */
  isConnected(): boolean {
    return (
      this._connected && this.ws !== null && this.ws.readyState === WS_OPEN
    );
  }

  /**
   * Return a snapshot of connection status for the management API.
   */
  getStatus(): GatewayStatus {
    return {
      orgId: this.config.orgId,
      connected: this._connected,
      lastSeen: this.lastSeen,
      reconnecting: this._reconnecting,
      servicesRunning: [...this.servicesRunning],
      error: this.lastError,
    };
  }

  /**
   * Return a copy of the config (used by triggerOpenClawAgent for webhook fallback).
   */
  getConfig(): GatewayConfig {
    return { ...this.config };
  }

  // ---- Internal: Connection & Auth ---------------------------------------

  private async _openAndAuth(): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      let ws: WebSocketLike;
      try {
        ws = await createWebSocket(this.config.gatewayUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.lastError = `WebSocket creation failed: ${msg}`;
        reject(new Error(this.lastError));
        return;
      }

      // Timeout for the entire handshake (connect frame -> ack)
      const authTimeout = setTimeout(() => {
        this.lastError = 'Auth handshake timed out';
        ws.close(4001, 'Auth timeout');
        reject(new Error(this.lastError));
      }, AUTH_TIMEOUT_MS);

      const onOpen = () => {
        // Send connect frame as the very first message
        const connectFrame: ConnectFrame = {
          type: 'connect',
          params: { auth: { token: this.config.authToken } },
        };
        ws.send(JSON.stringify(connectFrame));
        log('debug', `Connect frame sent`, { orgId: this.config.orgId });
      };

      const onMessage = (rawEvent: any) => {
        try {
          const raw =
            typeof rawEvent === 'string'
              ? rawEvent
              : rawEvent?.data ?? String(rawEvent);
          const frame: InboundFrame = JSON.parse(raw);

          if (frame.type === 'connected') {
            // Auth acknowledged by the gateway
            clearTimeout(authTimeout);
            this.ws = ws;
            this._connected = true;
            this.lastSeen = new Date();
            this.lastError = undefined;

            if (
              frame.payload &&
              Array.isArray((frame.payload as any).services)
            ) {
              this.servicesRunning = (frame.payload as any).services;
            }

            // Replace temporary listeners with permanent ones
            ws.removeEventListener('message', onMessage);
            ws.removeEventListener('open', onOpen);
            ws.removeEventListener('error', onError);
            ws.removeEventListener('close', onClose);
            this.attachPermanentListeners(ws);
            resolve();
            return;
          }

          // If we receive a response before the connected ack (auth rejection)
          if (frame.type === 'res' && !(frame as ResponseFrame).ok) {
            clearTimeout(authTimeout);
            const errMsg =
              (frame as ResponseFrame).error?.message || 'Auth rejected';
            this.lastError = errMsg;
            ws.close(4002, errMsg);
            reject(new Error(errMsg));
          }
        } catch {
          // Ignore non-JSON messages during handshake
        }
      };

      const onError = (err: any) => {
        clearTimeout(authTimeout);
        const msg = err?.message || 'WebSocket error during connect';
        this.lastError = msg;
        reject(new Error(msg));
      };

      const onClose = (ev: any) => {
        clearTimeout(authTimeout);
        const code = ev?.code || 'unknown';
        const reason = ev?.reason || 'unknown';
        this.lastError = `WebSocket closed during handshake: code=${code} reason=${reason}`;
        reject(new Error(this.lastError));
      };

      ws.addEventListener('open', onOpen);
      ws.addEventListener('message', onMessage);
      ws.addEventListener('error', onError);
      ws.addEventListener('close', onClose);
    });
  }

  private attachPermanentListeners(ws: WebSocketLike): void {
    ws.addEventListener('message', (rawEvent: any) => {
      this.handleMessage(rawEvent);
    });

    ws.addEventListener('close', (ev: any) => {
      const code = ev?.code || 'unknown';
      const reason = ev?.reason || '';
      this._connected = false;
      log('warn', `WebSocket closed`, {
        orgId: this.config.orgId,
        code,
        reason,
      });
      this.rejectAllPending(new Error(`WebSocket closed: code=${code}`));
      this.stopHeartbeat();

      if (!this._destroyed) {
        this.scheduleReconnect();
      }
    });

    ws.addEventListener('error', (err: any) => {
      const msg = err?.message || 'WebSocket error';
      log('error', `WebSocket error`, {
        orgId: this.config.orgId,
        error: msg,
      });
      this.lastError = msg;
    });
  }

  // ---- Internal: Message Handling ----------------------------------------

  private handleMessage(rawEvent: any): void {
    try {
      const raw =
        typeof rawEvent === 'string'
          ? rawEvent
          : rawEvent?.data ?? String(rawEvent);
      const frame: InboundFrame = JSON.parse(raw);
      this.lastSeen = new Date();

      if (frame.type === 'res') {
        this.handleResponse(frame as ResponseFrame);
      } else if (frame.type === 'event') {
        this.handleEvent(frame as EventFrame);
      } else if (frame.type === 'connected') {
        // Re-auth ack during reconnection -- update services
        const payload = (frame as any).payload;
        if (payload && Array.isArray(payload.services)) {
          this.servicesRunning = payload.services;
        }
      }
    } catch (err) {
      log('warn', `Failed to parse inbound frame`, {
        orgId: this.config.orgId,
        error: err instanceof Error ? err.message : 'Parse error',
      });
    }
  }

  private handleResponse(frame: ResponseFrame): void {
    const pending = this.pendingRequests.get(frame.id);
    if (!pending) {
      log('debug', `Received response for unknown request`, { id: frame.id });
      return;
    }

    this.pendingRequests.delete(frame.id);
    clearTimeout(pending.timeout);

    if (frame.ok) {
      pending.resolve(frame.payload);
    } else {
      const errMsg = frame.error?.message || 'RPC error';
      pending.reject(
        new Error(
          `RPC failed: ${errMsg} (code: ${frame.error?.code || 'unknown'})`,
        ),
      );
    }
  }

  private handleEvent(frame: EventFrame): void {
    const event: OpenClawEvent = {
      type: frame.event,
      payload: frame.payload,
      seq: frame.seq,
    };

    this.eventHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (err) {
        log('error', `Event handler threw`, {
          orgId: this.config.orgId,
          eventType: frame.event,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  }

  // ---- Internal: Heartbeat -----------------------------------------------

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.send('system.ping', {}).catch((err) => {
          log('warn', `Heartbeat ping failed`, {
            orgId: this.config.orgId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Prevent the heartbeat timer from keeping Node.js alive
    if (
      this.heartbeatTimer &&
      typeof this.heartbeatTimer === 'object' &&
      'unref' in this.heartbeatTimer
    ) {
      (this.heartbeatTimer as NodeJS.Timeout).unref();
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ---- Internal: Reconnection --------------------------------------------

  private scheduleReconnect(): void {
    if (this._destroyed || this._reconnecting) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.lastError = `Reconnect failed after ${MAX_RECONNECT_ATTEMPTS} attempts`;
      log('error', this.lastError, { orgId: this.config.orgId });
      this._reconnecting = false;
      return;
    }

    this._reconnecting = true;
    this.reconnectAttempts++;

    // Exponential backoff with jitter
    const baseDelay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
      RECONNECT_MAX_DELAY_MS,
    );
    const jitter = Math.random() * baseDelay * 0.3;
    const delay = Math.round(baseDelay + jitter);

    log(
      'info',
      `Scheduling reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`,
      { orgId: this.config.orgId },
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this._openAndAuth();
        this.reconnectAttempts = 0;
        this._reconnecting = false;
        this.startHeartbeat();
        log('info', `Reconnected to gateway`, { orgId: this.config.orgId });
      } catch (err) {
        log('warn', `Reconnect attempt ${this.reconnectAttempts} failed`, {
          orgId: this.config.orgId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        // Allow the next attempt
        this._reconnecting = false;
        this.scheduleReconnect();
      }
    }, delay);

    // Prevent reconnect timer from keeping Node.js alive
    if (
      this.reconnectTimer &&
      typeof this.reconnectTimer === 'object' &&
      'unref' in this.reconnectTimer
    ) {
      (this.reconnectTimer as NodeJS.Timeout).unref();
    }
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ---- Internal: Cleanup -------------------------------------------------

  private rejectAllPending(error: Error): void {
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(error);
    });
    this.pendingRequests.clear();
  }
}

// =========================================================================
// GatewayManager
// =========================================================================

export class GatewayManager {
  private connections = new Map<string, GatewayConnection>();

  /**
   * Get an existing connection by orgId.
   * Returns null if no connection is registered.
   */
  getConnection(orgId: string): GatewayConnection | null {
    return this.connections.get(orgId) ?? null;
  }

  /**
   * Register and connect to a customer gateway.
   * If a connection already exists for this orgId, it is disconnected first.
   */
  async registerGateway(
    orgId: string,
    config: GatewayConfig,
  ): Promise<GatewayConnection> {
    // Tear down existing connection if present
    const existing = this.connections.get(orgId);
    if (existing) {
      log('info', `Replacing existing gateway connection`, { orgId });
      await existing.disconnect().catch(() => {});
    }

    const conn = new GatewayConnection({ ...config, orgId });
    this.connections.set(orgId, conn);

    try {
      await conn.connect();
    } catch (err) {
      // Keep the connection registered even if initial connect fails.
      // It will auto-reconnect in the background.
      log('warn', `Initial connection failed, will auto-reconnect`, {
        orgId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    return conn;
  }

  /**
   * Remove and disconnect a gateway.
   */
  removeGateway(orgId: string): void {
    const conn = this.connections.get(orgId);
    if (conn) {
      conn.disconnect().catch(() => {});
      this.connections.delete(orgId);
      log('info', `Gateway removed`, { orgId });
    }
  }

  /**
   * Get the status of a specific gateway.
   */
  getStatus(orgId: string): GatewayStatus {
    const conn = this.connections.get(orgId);
    if (!conn) {
      return {
        orgId,
        connected: false,
        lastSeen: null,
        reconnecting: false,
        servicesRunning: [],
        error: 'No gateway registered',
      };
    }
    return conn.getStatus();
  }

  /**
   * List statuses of all registered gateways.
   */
  listGateways(): GatewayStatus[] {
    const statuses: GatewayStatus[] = [];
    this.connections.forEach((conn) => {
      statuses.push(conn.getStatus());
    });
    return statuses;
  }

  /**
   * Gracefully shut down all connections (for process cleanup).
   */
  async shutdown(): Promise<void> {
    log(
      'info',
      `Shutting down all gateway connections (${this.connections.size} total)`,
    );
    const disconnects: Promise<void>[] = [];
    this.connections.forEach((conn) => {
      disconnects.push(conn.disconnect().catch(() => {}));
    });
    await Promise.all(disconnects);
    this.connections.clear();
  }
}

// =========================================================================
// Singleton
// =========================================================================

/**
 * Module-level singleton. In Next.js serverless, this persists across
 * warm invocations within the same Lambda/Edge instance.
 *
 * Attach to globalThis to survive Next.js hot-reloads in development.
 */
const GLOBAL_KEY = '__nexusBrain_gatewayManager__';

function getGlobalManager(): GatewayManager {
  const g = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new GatewayManager();
  }
  return g[GLOBAL_KEY] as GatewayManager;
}

export const gatewayManager: GatewayManager = getGlobalManager();

// =========================================================================
// triggerOpenClawAgent -- high-level async iterator for copilot integration
// =========================================================================

/**
 * Send a copilot query through OpenClaw and yield SSE-compatible events.
 *
 * Strategy:
 *   1. If the org has an active WebSocket connection, use it (real-time path).
 *   2. Otherwise, fall back to the webhook POST path (/hooks/agent).
 *   3. If neither is available, yield an error.
 *
 * Yields:
 *   - { text: "..." }              -- streaming text chunk
 *   - { agentStep: {...} }         -- agent execution step
 *   - { agentStatus: {...} }       -- task status update
 *   - { error: "..." }             -- error event
 *   - '[DONE]'                     -- stream complete
 */
export async function* triggerOpenClawAgent(
  params: TriggerOpenClawParams,
): AsyncGenerator<AgentStreamEvent, void, undefined> {
  const { orgId, message, sessionKey, agentId, model } = params;
  const conn = gatewayManager.getConnection(orgId);

  // Try WebSocket path first
  if (conn && conn.isConnected()) {
    yield* streamViaWebSocket(conn, { message, sessionKey, agentId, model });
    return;
  }

  // Fallback to webhook POST
  const config = conn?.getConfig();
  const webhookUrl = config?.webhookUrl;
  const webhookToken = config?.webhookToken ?? config?.authToken;

  if (!webhookUrl) {
    yield {
      error: `No gateway connection or webhook URL configured for org ${orgId}`,
    };
    yield '[DONE]';
    return;
  }

  yield* streamViaWebhook(webhookUrl, webhookToken ?? '', {
    message,
    sessionKey,
    agentId,
    model,
  });
}

// =========================================================================
// WebSocket streaming path
// =========================================================================

async function* streamViaWebSocket(
  conn: GatewayConnection,
  params: {
    message: string;
    sessionKey?: string;
    agentId?: string;
    model?: string;
  },
): AsyncGenerator<AgentStreamEvent, void, undefined> {
  // Buffer for events received between consumer yields
  const eventBuffer: OpenClawEvent[] = [];
  let done = false;
  let streamError: Error | null = null;

  // Promise-based wake mechanism for the consumer loop
  let wakeResolve: (() => void) | null = null;

  function wake(): void {
    if (wakeResolve) {
      const r = wakeResolve;
      wakeResolve = null;
      r();
    }
  }

  function waitForEvent(): Promise<void> {
    if (eventBuffer.length > 0 || done || streamError) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      wakeResolve = resolve;
    });
  }

  // Subscribe to events for the duration of this stream
  const unsubscribe = conn.onEvent((event) => {
    if (
      event.type === 'chat' ||
      event.type === 'agent' ||
      event.type === 'done' ||
      event.type === 'error'
    ) {
      eventBuffer.push(event);
      if (event.type === 'done' || event.type === 'error') {
        done = true;
      }
      wake();
    }
  });

  // Safety timeout: if the gateway goes silent, stop waiting
  const safetyTimeout = setTimeout(() => {
    if (!done) {
      streamError = new Error('OpenClaw agent stream timed out after 120s');
      wake();
    }
  }, WEBHOOK_TIMEOUT_MS);

  try {
    // Initiate the agent conversation via RPC
    const rpcParams: Record<string, unknown> = {
      message: params.message,
    };
    if (params.sessionKey) rpcParams.sessionKey = params.sessionKey;
    if (params.agentId) rpcParams.agentId = params.agentId;
    if (params.model) rpcParams.model = params.model;

    // Fire the RPC. The actual response content comes via event frames.
    conn.send('chat.send', rpcParams).catch((err) => {
      streamError =
        err instanceof Error ? err : new Error(String(err));
      wake();
    });

    // Yield a starting status
    yield {
      agentStatus: {
        taskId: params.sessionKey || 'default',
        status: 'running',
        message: 'Agent processing via OpenClaw gateway',
      },
    };

    // Consume event buffer until done
    while (!done && !streamError) {
      await waitForEvent();

      while (eventBuffer.length > 0) {
        const event = eventBuffer.shift()!;
        const converted = convertOpenClawEvent(event);
        if (converted) {
          yield converted;
        }
      }
    }

    if (streamError !== null) {
      yield { error: (streamError as Error).message };
    }
  } finally {
    clearTimeout(safetyTimeout);
    unsubscribe();
  }

  yield '[DONE]';
}

// =========================================================================
// Webhook fallback streaming path
// =========================================================================

async function* streamViaWebhook(
  webhookUrl: string,
  token: string,
  params: {
    message: string;
    sessionKey?: string;
    agentId?: string;
    model?: string;
  },
): AsyncGenerator<AgentStreamEvent, void, undefined> {
  yield {
    agentStatus: {
      taskId: params.sessionKey || 'default',
      status: 'running',
      message: 'Agent processing via OpenClaw webhook',
    },
  };

  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: params.message,
        sessionKey: params.sessionKey,
        agentId: params.agentId,
        model: params.model,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Webhook request failed';
    yield { error: `OpenClaw webhook error: ${msg}` };
    yield '[DONE]';
    return;
  }

  if (!response.ok) {
    let errBody = '';
    try {
      errBody = await response.text();
    } catch {
      // Ignore body read failure
    }
    yield {
      error: `OpenClaw webhook returned HTTP ${response.status}: ${errBody.substring(0, 200)}`,
    };
    yield '[DONE]';
    return;
  }

  // Check if response is SSE stream or plain JSON
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream')) {
    yield* parseSSEStream(response);
  } else {
    // Plain JSON response -- emit as a single text chunk
    try {
      const body = await response.json();
      if (body.text) {
        yield { text: body.text };
      } else if (body.response) {
        yield { text: body.response };
      } else if (body.message) {
        yield { text: body.message };
      } else {
        yield { text: JSON.stringify(body) };
      }
    } catch {
      const text = await response.text().catch(() => '');
      if (text) {
        yield { text };
      }
    }
  }

  yield '[DONE]';
}

// =========================================================================
// SSE stream parser for webhook responses
// =========================================================================

async function* parseSSEStream(
  response: Response,
): AsyncGenerator<AgentStreamEvent, void, undefined> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue; // Skip empty lines and comments

        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);

            // Convert OpenClaw SSE payload to our event format
            if (parsed.type === 'event') {
              const converted = convertOpenClawEvent({
                type: parsed.event || parsed.type,
                payload: parsed.payload || parsed.data,
                seq: parsed.seq,
              });
              if (converted) yield converted;
            } else if (parsed.text) {
              yield { text: parsed.text };
            } else if (parsed.agentStep) {
              yield { agentStep: parsed.agentStep };
            } else if (parsed.error) {
              yield { error: parsed.error };
            }
          } catch {
            // Non-JSON SSE data line -- treat as plain text
            if (data.length > 0) {
              yield { text: data };
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// =========================================================================
// Event conversion: OpenClaw protocol -> NexusBrain SSE format
// =========================================================================

/**
 * Convert an OpenClaw event frame into the NexusBrain copilot SSE event format.
 *
 * Mapping:
 *   OpenClaw { type: "event", event: "chat", payload: { text } }   --> { text: "..." }
 *   OpenClaw { type: "event", event: "agent", payload: { step } }  --> { agentStep: {...} }
 *   OpenClaw { type: "event", event: "error", payload: { msg } }   --> { error: "..." }
 *   OpenClaw { type: "event", event: "done" }                      --> null (caller emits [DONE])
 */
function convertOpenClawEvent(event: OpenClawEvent): AgentStreamEvent | null {
  const payload = event.payload as Record<string, any> | null;

  switch (event.type) {
    case 'chat': {
      if (payload?.text) return { text: payload.text };
      if (payload?.delta) return { text: payload.delta };
      return null;
    }

    case 'agent': {
      // Agent execution step events
      if (payload?.step || payload?.toolName || payload?.type) {
        const step: AgentStep = {
          stepNumber: payload.stepNumber ?? payload.step ?? 0,
          type: mapAgentStepType(
            payload.type || payload.stepType || 'acting',
          ),
          title:
            payload.title ||
            payload.description ||
            payload.toolName ||
            'Agent step',
          content: payload.content || payload.output,
          toolName: payload.toolName || payload.tool,
          durationMs: payload.durationMs ?? payload.duration,
          status: mapStepStatus(payload.status || 'started'),
        };
        return { agentStep: step };
      }

      // Plain agent text event
      if (payload?.text) return { text: payload.text };
      return null;
    }

    case 'presence': {
      // Connection/presence updates -- silently ignore
      return null;
    }

    case 'error': {
      const msg =
        payload?.message || payload?.error || 'Unknown OpenClaw error';
      return { error: typeof msg === 'string' ? msg : JSON.stringify(msg) };
    }

    case 'done': {
      // Stream completion -- the caller handles emitting [DONE]
      return null;
    }

    default: {
      log('debug', `Unknown OpenClaw event type: ${event.type}`, {
        seq: event.seq,
      });
      return null;
    }
  }
}

function mapAgentStepType(type: string): AgentStep['type'] {
  const typeMap: Record<string, AgentStep['type']> = {
    thinking: 'thinking',
    think: 'thinking',
    query: 'querying',
    querying: 'querying',
    search: 'querying',
    act: 'acting',
    acting: 'acting',
    tool: 'acting',
    tool_call: 'acting',
    observe: 'observing',
    observing: 'observing',
    result: 'observing',
    reflect: 'reflecting',
    reflecting: 'reflecting',
    summarize: 'reflecting',
  };
  return typeMap[type.toLowerCase()] || 'acting';
}

function mapStepStatus(status: string): AgentStep['status'] {
  const statusMap: Record<string, AgentStep['status']> = {
    started: 'started',
    start: 'started',
    running: 'started',
    in_progress: 'started',
    completed: 'completed',
    complete: 'completed',
    done: 'completed',
    success: 'completed',
    failed: 'failed',
    fail: 'failed',
    error: 'failed',
  };
  return statusMap[status.toLowerCase()] || 'started';
}
