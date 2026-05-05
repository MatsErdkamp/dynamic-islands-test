export type WebSocketBroadcast = {
  type: "artifact.updated" | "view.updated";
  islandId: string;
  version?: number;
  artifactId?: string;
};

export class EditableWebSocketHub {
  private readonly sockets = new Set<WebSocket>();

  add(socket: WebSocket): void {
    this.sockets.add(socket);
    socket.addEventListener("close", () => this.sockets.delete(socket));
    socket.addEventListener("error", () => this.sockets.delete(socket));
  }

  broadcast(event: WebSocketBroadcast): void {
    const payload = JSON.stringify(event);

    for (const socket of this.sockets) {
      try {
        socket.send(payload);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }
}

export function createWebSocketPair():
  | { client: WebSocket; server: WebSocket }
  | undefined {
  const Pair = (globalThis as typeof globalThis & {
    WebSocketPair?: new () => { 0: WebSocket; 1: WebSocket };
  }).WebSocketPair as
    | (new () => { 0: WebSocket; 1: WebSocket })
    | undefined;

  if (!Pair) {
    return undefined;
  }

  const pair = new Pair();

  return {
    client: pair[0],
    server: pair[1],
  };
}
