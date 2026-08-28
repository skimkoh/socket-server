import { createServer } from "http";
import { Server } from "socket.io";
import { lockManager } from "./lockManager";
import {
    ClientToServerEvents,
    ServerToClientEvents,
    LockInfo,
} from "./types";

const httpServer = createServer();
const io = new Server<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
        cors: { origin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000" },
    }
);

io.on("connection", (socket) => {
    socket.on("lock:acquire", ({ itemId, userId, userName }, ack) => {
        const lock: LockInfo = {
            itemId,
            userId,
            userName,
            socketId: socket.id,
            acquiredAt: Date.now(),
        };

        const result = lockManager.acquire(itemId, lock);

        if (result.ok) {
            socket.join(`item:${itemId}`);
            ack({ ok: true, lock: result.lock });
            socket.to(`item:${itemId}`).emit("lock:acquired", result.lock);
            io.to(`watch:${itemId}`).emit("lock:status", { [itemId]: result.lock });
        } else {
            ack({ ok: false, lock: result.lock });
        }
    });

    socket.on("lock:release", ({ itemId, userId }) => {
        if (lockManager.release(itemId, userId)) {
            io.to(`item:${itemId}`).emit("lock:released", itemId);
            io.to(`watch:${itemId}`).emit("lock:status", { [itemId]: null });
            socket.leave(`item:${itemId}`);
        }
    });

    socket.on("lock:heartbeat", ({ itemId, userId }) => {
        lockManager.heartbeat(itemId, userId);
    });

    socket.on("lock:subscribe", (itemIds) => {
        const statuses: Record<string, LockInfo | null> = {};
        for (const id of itemIds) {
            socket.join(`watch:${id}`);
            statuses[id] = lockManager.get(id);
        }
        socket.emit("lock:status", statuses);
    });

    socket.on("lock:unsubscribe", (itemIds) => {
        for (const id of itemIds) {
            socket.leave(`watch:${id}`);
        }
    });

    socket.on("disconnect", () => {
        const releasedItemIds = lockManager.releaseBySocket(socket.id);
        for (const itemId of releasedItemIds) {
            io.to(`item:${itemId}`).emit("lock:released", itemId);
            io.to(`watch:${itemId}`).emit("lock:status", { [itemId]: null });
        }
    });
});

process.on("SIGTERM", () => {
    io.close(() => process.exit(0));
});

const PORT = process.env.PORT ?? 4000;
httpServer.listen(PORT, () => console.log(`Socket.IO server on :${PORT}`));