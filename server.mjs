import { createServer } from "node:http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const development = process.env.NODE_ENV !== "production";
const publicOrigin = new URL(
  process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${port}`,
).origin;
const socketPath = "/socket.io";
const publishKey = "__qenvaroRealtimePublish";

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be a valid TCP port.");
}

const httpServer = createServer();
const application = next({
  dev: development,
  hostname,
  port,
  httpServer,
});
const handle = application.getRequestHandler();

httpServer.on("request", (request, response) => {
  void handle(request, response).catch(() => {
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("content-type", "text/plain; charset=utf-8");
    }
    response.end("Internal server error");
  });
});

await application.prepare();

const io = new SocketIOServer(httpServer, {
  path: socketPath,
  serveClient: false,
  maxHttpBufferSize: 8 * 1024,
  connectTimeout: 10_000,
  cors: {
    origin: publicOrigin,
    credentials: true,
    methods: ["GET", "POST"],
  },
  allowRequest: (request, callback) => {
    const origin = request.headers.origin;
    callback(null, !origin || origin === publicOrigin);
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60_000,
    skipMiddlewares: false,
  },
});

function tenantRoom(tenantId) {
  return `tenant:${tenantId}`;
}

function userRoom(tenantId, userId) {
  return `${tenantRoom(tenantId)}:user:${userId}`;
}

function roleRoom(tenantId, role) {
  return `${tenantRoom(tenantId)}:role:${role}`;
}

function isSessionPayload(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.tenantId === "string" &&
    typeof value.tenantSlug === "string" &&
    typeof value.userId === "string" &&
    Array.isArray(value.roles) &&
    value.roles.every((role) => typeof role === "string")
  );
}

async function authenticateSocket(socket) {
  const tenantSlug = socket.handshake.auth?.tenantSlug;
  const cookie = socket.request.headers.cookie;
  if (
    typeof tenantSlug !== "string" ||
    !/^[a-z0-9-]{2,80}$/.test(tenantSlug) ||
    !cookie
  ) {
    return null;
  }

  const url = new URL("/api/realtime/session", `http://127.0.0.1:${port}`);
  url.searchParams.set("tenantSlug", tenantSlug);
  const response = await fetch(url, {
    headers: {
      cookie,
      accept: "application/json",
      "x-forwarded-host": new URL(publicOrigin).host,
      "x-forwarded-proto": new URL(publicOrigin).protocol.slice(0, -1),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return isSessionPayload(payload) ? payload : null;
}

io.use(async (socket, nextMiddleware) => {
  try {
    const identity = await authenticateSocket(socket);
    if (!identity) {
      nextMiddleware(new Error("Authentication required"));
      return;
    }
    socket.data.identity = identity;
    nextMiddleware();
  } catch {
    nextMiddleware(new Error("Authentication required"));
  }
});

io.on("connection", (socket) => {
  const identity = socket.data.identity;
  if (!isSessionPayload(identity)) {
    socket.disconnect(true);
    return;
  }
  void socket.join([
    tenantRoom(identity.tenantId),
    userRoom(identity.tenantId, identity.userId),
    ...identity.roles.map((role) => roleRoom(identity.tenantId, role)),
    "platform:announcements",
  ]);
});

globalThis[publishKey] = (publication) => {
  if (!publication || typeof publication !== "object") return false;
  const { event, payload, target } = publication;
  if (
    ![
      "notification:created",
      "notification:read",
      "notification:removed",
    ].includes(event) ||
    !payload ||
    typeof payload !== "object" ||
    !target ||
    typeof target !== "object"
  ) {
    return false;
  }

  if (target.kind === "platform") {
    io.to("platform:announcements").emit(event, payload);
    return true;
  }
  if (typeof target.tenantId !== "string") return false;
  if (target.kind === "tenant") {
    io.to(tenantRoom(target.tenantId)).emit(event, payload);
    return true;
  }
  if (target.kind === "user" && typeof target.userId === "string") {
    io.to(userRoom(target.tenantId, target.userId)).emit(event, payload);
    return true;
  }
  if (
    target.kind === "roles" &&
    Array.isArray(target.roles) &&
    target.roles.every((role) => typeof role === "string")
  ) {
    let operator = io;
    for (const role of target.roles) {
      operator = operator.to(roleRoom(target.tenantId, role));
    }
    operator.emit(event, payload);
    return true;
  }
  return false;
};

httpServer.listen(port, hostname, () => {
  console.log(
    `Qenvaro listening on http://${hostname}:${port} with Socket.IO at ${socketPath}`,
  );
});

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`Received ${signal}; closing realtime and HTTP servers.`);
  globalThis[publishKey] = undefined;
  io.disconnectSockets(true);
  await new Promise((resolve) => io.close(resolve));
  await application.close();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
