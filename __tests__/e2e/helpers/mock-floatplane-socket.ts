/**
 * In-memory Floatplane sync socket for the E2E suite: replaces the global WebSocket and speaks the
 * server half of the Sails / Socket.IO v2 (EIO3) protocol the app's FloatplaneSocket expects —
 * handshake, ping/pong, `tk/connect` authentication against the mock API's sessions — and lets
 * tests push `syncEvent`s (e.g. a new-post notification) to every authenticated client.
 */

import type { CreatorNotificationPayload } from '@/notifications/creator-notification';

import { api } from './mock-floatplane-api';

export class MockServerSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;

  /** Frames the app sent. */
  sent: string[] = [];
  closed = false;
  /** The session the client authenticated with (null until `tk/connect` succeeds). */
  token: string | null = null;

  constructor(
    readonly url: string,
    readonly protocols: unknown,
    readonly options: { headers?: Record<string, string> } | undefined,
  ) {
    socketServer.sockets.push(this);
    // Like a real server: the handshake arrives asynchronously after the upgrade.
    setTimeout(() => {
      if (this.closed) return;
      this.onopen?.();
      this.receive('0{"sid":"mock-sid","upgrades":[],"pingInterval":25000,"pingTimeout":60000}');
      this.receive('40');
    }, 0);
  }

  get headers(): Record<string, string> {
    return this.options?.headers ?? {};
  }

  send(data: string): void {
    this.sent.push(data);
    if (data === '2') {
      if (!socketServer.silent) this.receive('3');
      return;
    }
    const match = /^42(\d+)(\[.*)$/s.exec(data);
    if (!match) return;
    const [method, request] = JSON.parse(match[2]) as [string, { url?: string; data?: { token?: string } }];
    if (method !== 'post' || request.url !== '/api/v3/socket/tk/connect') return;
    const token = request.data?.token ?? '';
    if (socketServer.connectStatus !== null) {
      this.receive(`43${match[1]}${JSON.stringify([{ body: {}, headers: {}, statusCode: socketServer.connectStatus }])}`);
      return;
    }
    const ok = api.sessions.has(token) && !socketServer.rejectTokens;
    if (ok) this.token = token;
    const body = ok ? { message: 'User sync setup.' } : { message: 'You must be logged-in to access this resource.' };
    this.receive(`43${match[1]}${JSON.stringify([{ body, headers: {}, statusCode: ok ? 200 : 403 }])}`);
  }

  close(): void {
    this.closed = true;
  }

  /** Server → client frame. */
  receive(frame: string): void {
    if (!this.closed) this.onmessage?.({ data: frame });
  }

  /** The server drops the connection. */
  drop(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.({ code: 1006 });
  }
}

export const socketServer = {
  sockets: [] as MockServerSocket[],
  /** Refuse every token (403), as for a session the socket service no longer accepts. */
  rejectTokens: false,
  /** Answer `tk/connect` with this status instead of authenticating (null: normal behaviour). */
  connectStatus: null as number | null,
  /** Stop answering pings (a dead connection the client must notice by itself). */
  silent: false,

  /** Send a raw frame to every open client. */
  broadcast(frame: string): void {
    this.sockets.filter(socket => !socket.closed).forEach(socket => socket.receive(frame));
  },

  /** Sockets that are open and authenticated. */
  connected(): MockServerSocket[] {
    return this.sockets.filter(socket => !socket.closed && socket.token !== null);
  },

  /** Push a `syncEvent` to every authenticated client. */
  emit(event: string, data: unknown): void {
    this.connected().forEach(socket => socket.receive(`42${JSON.stringify(['syncEvent', { event, data }])}`));
  },

  /** Floatplane announces a new post (the `creatorNotification` floatplane.com receives). */
  notifyPostRelease(payload: CreatorNotificationPayload): void {
    this.emit('creatorNotification', { eventType: 'CONTENT_POST_RELEASE', ...payload });
  },

  reset(): void {
    this.sockets = [];
    this.rejectTokens = false;
    this.connectStatus = null;
    this.silent = false;
  },
};

Object.defineProperty(globalThis, 'WebSocket', { value: MockServerSocket, writable: true, configurable: true });
