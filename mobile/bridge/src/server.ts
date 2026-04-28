import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";

import type { Config } from "./config.js";
import type { Logger } from "./logger.js";
import type { TokenStore } from "./auth.js";
import { extractBearerFromHeader, extractBearerFromSubprotocols } from "./auth.js";
import type { PairingStore } from "./pairing.js";
import type { CodexChild } from "./child.js";
import { RpcRouter } from "./rpc.js";
import type { TlsMaterial } from "./tls.js";

interface BuildArgs {
  config: Config;
  log: Logger;
  tokens: TokenStore;
  pairings: PairingStore;
  child: CodexChild;
  tls: TlsMaterial;
}

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function buildServer(args: BuildArgs): Promise<FastifyInstance> {
  const { config, log, tokens, pairings, child, tls } = args;

  const app = Fastify({
    logger: log,
    https: config.tls
      ? { cert: tls.cert, key: tls.key }
      : undefined,
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: config.uploadMaxBytes, files: 1 },
  });

  const staticReady = existsSync(config.staticDir);
  if (staticReady) {
    await app.register(fastifyStatic, {
      root: config.staticDir,
      prefix: "/",
      wildcard: false,
    });
  } else {
    log.warn({ staticDir: config.staticDir }, "PWA build not found; static serving disabled");
  }

  await app.register(fastifyWebsocket);

  // ----- routes ------------------------------------------------------------

  app.get("/api/health", async () => ({
    ok: true,
    childAlive: child.isAlive(),
    version: PACKAGE_VERSION,
  }));

  app.post("/api/pair", { config: { rawBody: false } }, async (req, reply) => {
    if (!isLoopback(req)) {
      return reply.code(403).send({ error: "loopback only" });
    }
    const code = pairings.issue();
    return { pairCode: code.code, expiresAt: code.expiresAt };
  });

  app.post<{ Body: { pairCode: string; deviceName?: string } }>(
    "/api/pair/exchange",
    async (req, reply) => {
      const body = req.body ?? ({} as { pairCode: string; deviceName?: string });
      if (!body.pairCode || typeof body.pairCode !== "string") {
        return reply.code(400).send({ error: "pairCode required" });
      }
      const ok = pairings.consume(body.pairCode.trim().toUpperCase());
      if (!ok) {
        return reply.code(401).send({ error: "invalid or expired pair code" });
      }
      const { device, token } = await tokens.issue(body.deviceName?.slice(0, 200) || "phone");
      return {
        token,
        deviceId: device.id,
        fingerprint: tls.fingerprintSha256Hex,
        baseUrl: `https://${tls.lanIp}:${config.port}`,
      };
    },
  );

  app.addHook("onRequest", async (req, reply) => {
    // Auth gate for everything except health, pair, and SPA static.
    const path = req.routeOptions.url ?? req.url;
    if (
      path === "/api/health" ||
      path === "/api/pair" ||
      path === "/api/pair/exchange" ||
      !path.startsWith("/api/")
    ) {
      return;
    }
    const token = extractBearerFromHeader(req.headers["authorization"] as string | undefined);
    if (!token) return reply.code(401).send({ error: "missing bearer token" });
    const device = await tokens.findActiveByToken(token);
    if (!device) return reply.code(401).send({ error: "invalid token" });
    (req as FastifyRequest & { deviceId?: string }).deviceId = device.id;
  });

  app.post("/api/upload", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file" });
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      return reply.code(415).send({ error: `unsupported mime ${file.mimetype}` });
    }
    const ext = extname(file.filename || "") || mimeToExt(file.mimetype);
    const deviceId = (req as FastifyRequest & { deviceId?: string }).deviceId ?? "anon";
    const dir = join(config.uploadsDir, deviceId);
    await mkdir(dir, { recursive: true });
    const out = join(dir, `${randomUUID()}${ext}`);
    const buf = await file.toBuffer();
    await writeFile(out, buf);
    return { path: out, mime: file.mimetype, size: buf.length };
  });

  // ----- WS /rpc -----------------------------------------------------------

  const router = new RpcRouter(child, log);
  // expose to /rpc handler
  app.decorate("rpcRouter", router);

  app.register(async (instance) => {
    instance.get("/rpc", { websocket: true }, async (socket, req) => {
      // Auth: prefer subprotocol `bearer.<token>`, fall back to Authorization header (curl/wscat).
      const subToken = extractBearerFromSubprotocols(
        req.headers["sec-websocket-protocol"] as string | undefined,
      );
      const headerToken = extractBearerFromHeader(req.headers["authorization"] as string | undefined);
      const token = subToken ?? headerToken;
      if (!token) {
        socket.close(4401, "missing token");
        return;
      }
      const device = await tokens.findActiveByToken(token);
      if (!device) {
        socket.close(4401, "invalid token");
        return;
      }
      router.attach(socket as unknown as import("ws").WebSocket);
    });
  });

  // SPA fallback: any non-API GET that did not match a static file goes to index.html.
  app.setNotFoundHandler((req, reply) => {
    if (
      staticReady &&
      req.method === "GET" &&
      !req.url.startsWith("/api/") &&
      !req.url.startsWith("/rpc")
    ) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "not found" });
  });

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    rpcRouter: RpcRouter;
  }
}

function isLoopback(req: FastifyRequest): boolean {
  const ip = req.ip;
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    default:
      return "";
  }
}

const PACKAGE_VERSION = "0.0.0";
