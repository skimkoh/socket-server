import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "http";
import { Server } from "socket.io";
import { io as ioClient, Socket } from "socket.io-client";
import { lockManager } from "../src/lockManager";

let httpServer: ReturnType<typeof createServer>;
let ioServer: Server;
let port: number;

function connectClient(): Promise<Socket> {
    return new Promise((resolve) => {
        const socket = ioClient(`http://localhost:${port}`, {
            transports: ["websocket"],
        });
        socket.on("connect", () => resolve(socket));
    });
}

beforeAll(async () => {
    httpServer = createServer();
    ioServer = new Server(httpServer);

    ioServer.on("connection", (socket) => {
        socket.on("lock:acquire", ({ itemId, userId, userName }, ack) => {
            const lock = {
                itemId,
                userId,
                userName,
                socketId: socket.id,
                acquiredAt: Date.now(),
            };

            const result = lockManager.acquire(itemId, lock);

            if (result.ok) {
                socket.join(`item:${itemId}`);
            }

            ack(result);
        });

        socket.on("lock:release", ({ itemId, userId }) => {
            lockManager.release(itemId, userId);
        });

        socket.on("disconnect", () => {
            lockManager.releaseBySocket(socket.id);
        });
    });

    await new Promise<void>((resolve) => {
        httpServer.listen(0, resolve);
    });

    const address = httpServer.address();

    if (!address || typeof address === "string") {
        throw new Error("Failed to start test server");
    }

    port = address.port;
});

afterAll(async () => {
    ioServer.close();

    await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
});

describe("item locking", () => {
    it("second user is denied when first user holds the lock", async () => {
        const alice = await connectClient();
        const bob = await connectClient();

        const aliceResult: any = await new Promise((resolve) =>
            alice.emit("lock:acquire", { itemId: "item-1", userId: "alice", userName: "Alice" }, resolve)
        );
        expect(aliceResult.ok).toBe(true);

        const bobResult: any = await new Promise((resolve) =>
            bob.emit("lock:acquire", { itemId: "item-1", userId: "bob", userName: "Bob" }, resolve)
        );
        expect(bobResult.ok).toBe(false);
        expect(bobResult.lock.userId).toBe("alice");

        alice.disconnect();
        bob.disconnect();
    });

    it("lock frees up after release", async () => {
        const alice = await connectClient();

        await new Promise((resolve) =>
            alice.emit("lock:acquire", { itemId: "item-2", userId: "alice", userName: "Alice" }, resolve)
        );

        alice.emit("lock:release", { itemId: "item-2", userId: "alice" });
        await new Promise((r) => setTimeout(r, 50)); // let it process

        const bob = await connectClient();
        const bobResult: any = await new Promise((resolve) =>
            bob.emit("lock:acquire", { itemId: "item-2", userId: "bob", userName: "Bob" }, resolve)
        );
        expect(bobResult.ok).toBe(true);

        alice.disconnect();
        bob.disconnect();
    });
});