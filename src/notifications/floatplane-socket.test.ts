import { FloatplaneSocket, SOCKET_CONNECT_PATH, SOCKET_URL, type SocketLike, type SocketState } from '@/notifications/floatplane-socket';

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code?: number }) => void) | null = null;
  sent: string[] = [];
  closed = false;
  throwOnSend = false;

  constructor(
    readonly url: string,
    readonly headers: Record<string, string>,
  ) {}

  send(data: string) {
    if (this.throwOnSend) throw new Error('not open');
    this.sent.push(data);
  }

  close() {
    this.closed = true;
  }

  receive(frame: string) {
    this.onmessage?.({ data: frame });
  }
}

let sockets: FakeSocket[];
let events: [string, unknown][];
let states: SocketState[];

const latest = () => sockets[sockets.length - 1];

function create(options: Partial<ConstructorParameters<typeof FloatplaneSocket>[0]> = {}) {
  const client = new FloatplaneSocket({
    token: 'session-token',
    onSyncEvent: (event, data) => events.push([event, data]),
    onStateChange: state => states.push(state),
    createSocket: (url, headers) => {
      const socket = new FakeSocket(url, headers);
      sockets.push(socket);
      return socket;
    },
    ...options,
  });
  client.connect();
  return client;
}

/** Server side of a successful handshake + tk/connect. */
function handshake(socket = latest(), status = 200) {
  socket.receive('0{"sid":"abc","pingInterval":25000,"pingTimeout":60000}');
  socket.receive('40');
  socket.receive(`431[{"body":{"message":"User sync setup."},"headers":{},"statusCode":${status}}]`);
}

beforeEach(() => {
  jest.useFakeTimers();
  sockets = [];
  events = [];
  states = [];
});

afterEach(() => {
  jest.useRealTimers();
});

describe('connecting', () => {
  it('opens the sync socket with browser headers and authenticates with the token', () => {
    const client = create();

    expect(latest().url).toBe(SOCKET_URL);
    expect(latest().headers['User-Agent']).toMatch(/^Mozilla\/5\.0/);
    expect(latest().headers.Origin).toBe('https://www.floatplane.com');
    expect(client.currentState).toBe('connecting');

    latest().receive('0{"sid":"abc","pingInterval":25000,"pingTimeout":60000}');
    latest().receive('40');
    expect(JSON.parse(latest().sent[0].slice(3))).toEqual([
      'post',
      { method: 'post', headers: {}, data: { token: 'session-token' }, url: SOCKET_CONNECT_PATH },
    ]);
    expect(latest().sent[0].startsWith('421[')).toBe(true);

    latest().receive('431[{"body":{"message":"User sync setup."},"statusCode":200}]');
    expect(client.currentState).toBe('connected');
    expect(states).toEqual(['connecting', 'connected']);
  });

  it('ignores connect() while already connected', () => {
    const client = create();
    client.connect();
    expect(sockets).toHaveLength(1);
  });

  it('uses the native WebSocket by default', () => {
    const ctor = jest.fn(() => new FakeSocket('', {}));
    const original = globalThis.WebSocket;
    globalThis.WebSocket = ctor as unknown as typeof WebSocket;
    try {
      new FloatplaneSocket({ token: 't', onSyncEvent: () => undefined }).connect();
    } finally {
      globalThis.WebSocket = original;
    }
    expect(ctor).toHaveBeenCalledWith(SOCKET_URL, null, { headers: expect.objectContaining({ Origin: 'https://www.floatplane.com' }) });
  });
});

describe('events', () => {
  it('forwards sync events', () => {
    create();
    handshake();

    latest().receive('42["syncEvent",{"event":"creatorNotification","data":{"id":"n1"}}]');
    latest().receive('42["syncEvent",{"event":"userPhotoUpdated","data":null}]');
    expect(events).toEqual([
      ['creatorNotification', { id: 'n1' }],
      ['userPhotoUpdated', null],
    ]);
  });

  it('ignores other events, malformed frames and unknown packets', () => {
    create();
    handshake();

    latest().receive('42["somethingElse",{}]');
    latest().receive('42["syncEvent",{"data":{}}]');
    latest().receive('42["syncEvent"]');
    latest().receive('42not json');
    latest().receive('42[broken');
    latest().receive('42{"not":"an array"}');
    latest().receive('435[{"statusCode":200}]');
    latest().receive('6');
    latest().receive('3');
    expect(events).toEqual([]);
  });

  it('keeps the default ping settings when the open packet is malformed', () => {
    create();
    latest().receive('0{oops');
    jest.advanceTimersByTime(25_000);
    expect(latest().sent).toContain('2');
  });

  it('falls back to default ping settings when the open packet omits them', () => {
    create();
    latest().receive('0{"sid":"abc"}');
    jest.advanceTimersByTime(25_000);
    expect(latest().sent).toContain('2');
  });
});

describe('heartbeat', () => {
  it('pings every pingInterval', () => {
    create();
    handshake();

    jest.advanceTimersByTime(25_000);
    expect(latest().sent.filter(frame => frame === '2')).toHaveLength(1);
    latest().receive('3');
    jest.advanceTimersByTime(25_000);
    expect(latest().sent.filter(frame => frame === '2')).toHaveLength(2);
  });

  it('reconnects when the server stops answering', () => {
    create();
    handshake();
    const first = latest();

    // No pong for pingInterval + pingTimeout.
    jest.advanceTimersByTime(25_000 * 4);
    expect(first.closed).toBe(true);
    expect(states).toContain('disconnected');

    jest.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
  });
});

describe('reconnecting', () => {
  it('reconnects with exponential backoff after drops, resetting once connected', () => {
    create({ reconnectDelayMs: 1_000, maxReconnectDelayMs: 3_000 });

    latest().onclose?.({ code: 1006 });
    jest.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    latest().onerror?.(new Error('boom'));
    jest.advanceTimersByTime(2_000);
    expect(sockets).toHaveLength(3);

    // Capped at maxReconnectDelayMs.
    latest().receive('1');
    jest.advanceTimersByTime(3_000);
    expect(sockets).toHaveLength(4);

    handshake();
    latest().receive('41');
    jest.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(5);
  });

  it('retries when the connect request fails for another reason', () => {
    create();
    handshake(latest(), 500);
    expect(states).toEqual(['connecting', 'disconnected']);
    jest.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
  });

  it('retries when sending fails', () => {
    create();
    latest().throwOnSend = true;
    latest().receive('0{"pingInterval":25000,"pingTimeout":60000}');
    latest().receive('40');
    expect(states).toContain('disconnected');
  });

  it('ignores events from a socket it already replaced', () => {
    create();
    const stale = latest();
    const { onmessage, onclose, onerror } = stale;
    stale.onclose?.({});
    jest.advanceTimersByTime(1_000);

    onmessage?.({ data: '42["syncEvent",{"event":"creatorNotification","data":{}}]' });
    onclose?.({});
    onerror?.({});
    expect(events).toEqual([]);
    expect(sockets).toHaveLength(2);
  });

  it('copes with a socket that throws on close', () => {
    create();
    latest().close = () => {
      throw new Error('already closed');
    };
    expect(() => latest().onclose?.({})).not.toThrow();
  });
});

describe('stopping', () => {
  it('stops for good when the token is rejected', () => {
    const client = create();
    handshake(latest(), 403);

    expect(client.currentState).toBe('unauthorized');
    expect(latest().closed).toBe(true);
    jest.advanceTimersByTime(120_000);
    expect(sockets).toHaveLength(1);
  });

  it('close() tears down and cancels pending reconnects', () => {
    const client = create();
    latest().onclose?.({});
    client.close();
    jest.advanceTimersByTime(120_000);

    expect(sockets).toHaveLength(1);
    expect(client.currentState).toBe('closed');
    client.connect();
    expect(sockets).toHaveLength(1);
  });

  it('close() on a live connection closes the socket', () => {
    const client = create();
    handshake();
    client.close();
    expect(latest().closed).toBe(true);
    expect(latest().onmessage).toBeNull();
  });
});
