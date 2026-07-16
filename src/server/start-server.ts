import type { Server } from "node:http";
import { createServerApp, type CreateServerAppOptions } from "./app";

export interface StartLocalServerOptions extends CreateServerAppOptions {
  port?: number;
}

export interface LocalServerHandle {
  origin: string;
  server: Server;
  close(): Promise<void>;
}

export async function startLocalServer(options: StartLocalServerOptions = {}): Promise<LocalServerHandle> {
  const app = createServerApp(options);
  const server = await new Promise<Server>((resolve, reject) => {
    const listeningServer = app.listen(options.port ?? 0, "127.0.0.1", () => resolve(listeningServer));
    listeningServer.once("error", reject);
  });
  const address = server.address();

  if (!address || typeof address === "string") {
    server.close();
    throw new Error("无法确定本地服务端口。");
  }

  let closed = false;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    server,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        server.closeAllConnections?.();
      });
    }
  };
}
