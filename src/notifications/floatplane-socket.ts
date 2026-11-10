import { BROWSER_USER_AGENT } from '@/shared';

import { isJsonObject, numberField, type JsonObject } from './json-fields';

/**
 * Floatplane's real-time "sync" socket — the channel floatplane.com uses for new-post notifications.
 *
 * The server is Sails.js on Socket.IO v2 (Engine.IO protocol 3), spoken here directly over a
 * WebSocket so the app doesn't need socket.io-client:
 *
 *   server → `0{"sid",…,"pingInterval","pingTimeout"}`  Engine.IO open (the client pings, EIO3)
 *   server → `40`                                        Socket.IO connected to the default namespace
 *   client → `42<ack>["post",{method,headers,data:{token},url:"/api/v3/socket/tk/connect"}]`
 *   server → `43<ack>[{"body":{"message":"User sync setup."},"statusCode":200}]`
 *   server → `42["syncEvent",{"event":"creatorNotification","data":{…}}]`  (repeats)
 *
 * `tk/connect` is the token-mode variant of `/api/v3/socket/connect` (which authenticates with the
 * sails.sid cookie instead). The web client uses it when signed in with a session token, the same
 * token this app sends as `Authorization: Bearer`.
 */

export const SOCKET_URL =
  'wss://www.floatplane.com/socket.io/?__sails_io_sdk_version=1.2.1&__sails_io_sdk_platform=node' +
  '&__sails_io_sdk_language=javascript&EIO=3&transport=websocket';

export const SOCKET_CONNECT_PATH = '/api/v3/socket/tk/connect';

/** Lifecycle of the sync connection. `unauthorized` is terminal: the token was rejected. */
export type SocketState = 'connecting' | 'connected' | 'disconnected' | 'unauthorized' | 'closed';

/** The bits of a WebSocket this client uses (so tests can hand in a fake). */
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

type CreateSocket = (url: string, headers: Record<string, string>) => SocketLike;

export interface FloatplaneSocketOptions {
  token: string;
  /** Called for every `syncEvent` (e.g. `creatorNotification`, `userPhotoUpdated`). */
  onSyncEvent: (event: string, data: unknown) => void;
  onStateChange?: (state: SocketState) => void;
  createSocket?: CreateSocket;
  /** Reconnect backoff: starts here and doubles up to `maxReconnectDelayMs`. */
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

/** React Native's WebSocket takes extra headers as a third argument (the DOM typings don't know it). */
type NativeWebSocket = new (
  url: string,
  protocols: null,
  options: { headers: Record<string, string> },
) => SocketLike;

const defaultCreateSocket: CreateSocket = (url, headers) =>
  new (WebSocket as unknown as NativeWebSocket)(url, null, { headers });

const CONNECT_ACK_ID = 1;
const DEFAULT_PING_INTERVAL = 25_000;
const DEFAULT_PING_TIMEOUT = 60_000;
/** Reconnect delays double after every failed attempt. */
const BACKOFF_FACTOR = 2;

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

/** Engine.IO ping packet (EIO3: the client pings, the server answers `3`). */
const PING_PACKET = '2';

const FLOATPLANE_ORIGIN = 'https://www.floatplane.com';
// HTTP header names are PascalCase, which the naming convention rejects as plain object keys.
const ORIGIN_HEADER = 'Origin';

/** Socket.IO packet types this client acts on (the first digit after Engine.IO's `4`). */
const SOCKET_IO_CONNECT = '0';
const SOCKET_IO_DISCONNECT = '1';
const SOCKET_IO_EVENT = '2';
const SOCKET_IO_ACK = '3';

interface SocketIoPayload {
  ackId: number | null;
  args: unknown[];
}

/** A JSON array frame, or null when it is malformed or not an array. */
function parseJsonArray(json: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Split `42<ack>[…]` / `43<ack>[…]` into the ack id (if any) and the JSON args array. */
function parseSocketIoPayload(rest: string): SocketIoPayload | null {
  const match = /^(\d*)(\[.*)$/s.exec(rest);
  if (!match) {
    return null;
  }
  const [, ackDigits = '', json = ''] = match;
  const args = parseJsonArray(json);
  return args ? { ackId: ackDigits === '' ? null : Number(ackDigits), args } : null;
}

/** A JSON object frame, or an empty object when it is malformed or not an object. */
function parseJsonObject(json: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(json);
    return isJsonObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** The `statusCode` of a `tk/connect` ack. */
const ackStatus = (response: unknown): number | undefined =>
  isJsonObject(response) ? numberField(response, 'statusCode') : undefined;

export class FloatplaneSocket {
  private readonly options: Required<Omit<FloatplaneSocketOptions, 'onStateChange'>> &
    Pick<FloatplaneSocketOptions, 'onStateChange'>;
  private socket: SocketLike | null = null;
  private state: SocketState = 'disconnected';
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private lastMessageAt = 0;
  private pingTimeout = DEFAULT_PING_TIMEOUT;
  private pingInterval = DEFAULT_PING_INTERVAL;

  constructor(options: FloatplaneSocketOptions) {
    this.options = {
      createSocket: defaultCreateSocket,
      reconnectDelayMs: 1_000,
      maxReconnectDelayMs: 60_000,
      ...options,
    };
  }

  get currentState(): SocketState {
    return this.state;
  }

  /** Open the connection (no-op while one is open or after close()). */
  connect(): void {
    if (this.state === 'closed' || this.socket) {
      return;
    }
    this.clearReconnect();
    this.setState('connecting');

    const socket = this.options.createSocket(SOCKET_URL, {
      // floatplane.com sits behind Cloudflare bot management (see shared apiClient).
      'User-Agent': BROWSER_USER_AGENT,
      [ORIGIN_HEADER]: FLOATPLANE_ORIGIN,
    });
    this.socket = socket;
    this.lastMessageAt = Date.now();

    socket.onmessage = (event) => {
      if (this.socket === socket) this.handleMessage(String(event.data));
    };
    socket.onclose = () => {
      if (this.socket === socket) this.handleDrop();
    };
    socket.onerror = () => {
      // An error is always followed by close; close() handles reconnecting. Closing here covers
      // platforms that report the error but leave the socket half-open.
      if (this.socket === socket) this.handleDrop();
    };
  }

  /** Close for good: no reconnects, no further events. */
  close(): void {
    this.teardownSocket();
    this.clearReconnect();
    this.setState('closed');
  }

  private handleMessage(raw: string): void {
    this.lastMessageAt = Date.now();
    const type = raw.charAt(0);
    const rest = raw.slice(1);
    switch (type) {
      case '0':
        this.handleOpen(rest);
        break;
      case '1':
        // Engine.IO close.
        this.handleDrop();
        break;
      case '4':
        this.handleSocketIo(rest);
        break;
      default:
        // '3' pong (lastMessageAt above is the liveness signal), '6' noop.
        break;
    }
  }

  /** Engine.IO handshake: `{ sid, pingInterval, pingTimeout }` (defaults when malformed). */
  private handleOpen(json: string): void {
    const packet = parseJsonObject(json);
    this.pingInterval = numberField(packet, 'pingInterval') ?? DEFAULT_PING_INTERVAL;
    this.pingTimeout = numberField(packet, 'pingTimeout') ?? DEFAULT_PING_TIMEOUT;
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.ping();
    }, this.pingInterval);
  }

  private ping(): void {
    // No traffic (not even a pong) for a full ping cycle + timeout: the connection is dead.
    if (Date.now() - this.lastMessageAt > this.pingInterval + this.pingTimeout) {
      this.handleDrop();
      return;
    }
    this.send(PING_PACKET);
  }

  private handleSocketIo(packet: string): void {
    const type = packet.charAt(0);
    if (type === SOCKET_IO_CONNECT) {
      this.authenticate();
      return;
    }
    if (type === SOCKET_IO_DISCONNECT) {
      this.handleDrop();
      return;
    }
    const payload = parseSocketIoPayload(packet.slice(1));
    if (payload) {
      this.handleSocketIoPayload(type, payload);
    }
  }

  /** Connected to the namespace → authenticate the sync session. */
  private authenticate(): void {
    const request = {
      method: 'post',
      headers: {},
      data: { token: this.options.token },
      url: SOCKET_CONNECT_PATH,
    };
    this.send(`42${String(CONNECT_ACK_ID)}${JSON.stringify(['post', request])}`);
  }

  private handleSocketIoPayload(type: string, { ackId, args }: SocketIoPayload): void {
    if (type === SOCKET_IO_ACK && ackId === CONNECT_ACK_ID) {
      this.handleConnectAck(args[0]);
    } else if (type === SOCKET_IO_EVENT && args[0] === 'syncEvent') {
      this.handleSyncEvent(args[1]);
    }
  }

  /** `{ event, data }`: forwarded when it names an event. */
  private handleSyncEvent(sync: unknown): void {
    if (isJsonObject(sync) && typeof sync['event'] === 'string') {
      this.options.onSyncEvent(sync['event'], sync['data']);
    }
  }

  private handleConnectAck(response: unknown): void {
    const status = ackStatus(response);
    if (status === HTTP_OK) {
      this.reconnectAttempt = 0;
      this.setState('connected');
      return;
    }
    // 401/403: the token is no good on the socket. Retrying won't fix it.
    if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) {
      this.teardownSocket();
      this.setState('unauthorized');
      return;
    }
    this.handleDrop();
  }

  /** The connection went away: tear it down and schedule a reconnect with backoff. */
  private handleDrop(): void {
    if (this.state === 'closed' || this.state === 'unauthorized') {
      return;
    }
    this.teardownSocket();
    this.setState('disconnected');
    const { reconnectDelayMs, maxReconnectDelayMs } = this.options;
    const delay = Math.min(
      reconnectDelayMs * BACKOFF_FACTOR ** this.reconnectAttempt,
      maxReconnectDelayMs,
    );
    this.reconnectAttempt += 1;
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private send(data: string): void {
    try {
      this.socket?.send(data);
    } catch {
      this.handleDrop();
    }
  }

  private teardownSocket(): void {
    this.stopPing();
    const socket = this.socket;
    this.socket = null;
    if (!socket) {
      return;
    }
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      // Already closed.
    }
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
    }
    this.pingTimer = null;
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = null;
  }

  private setState(state: SocketState): void {
    if (this.state === state) {
      return;
    }
    this.state = state;
    this.options.onStateChange?.(state);
  }
}
