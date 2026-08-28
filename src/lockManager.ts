import { LockInfo } from "./types";

const LOCK_TTL_MS = 30_000; // lock considered stale after 30s without heartbeat

class LockManager {
    private locks = new Map<string, LockInfo>();

    get(itemId: string): LockInfo | null {
        const lock = this.locks.get(itemId);
        if (!lock) return null;
        if (Date.now() - lock.acquiredAt > LOCK_TTL_MS) {
            this.locks.delete(itemId);
            return null;
        }
        return lock;
    }

    acquire(itemId: string, lock: LockInfo): { ok: boolean; lock: LockInfo } {
        const existing = this.get(itemId);
        if (existing && existing.userId !== lock.userId) {
            return { ok: false, lock: existing };
        }
        this.locks.set(itemId, lock);
        return { ok: true, lock };
    }

    release(itemId: string, userId: string): boolean {
        const existing = this.locks.get(itemId);
        if (existing && existing.userId === userId) {
            this.locks.delete(itemId);
            return true;
        }
        return false;
    }

    releaseBySocket(socketId: string): string[] {
        const released: string[] = [];
        for (const [itemId, lock] of this.locks.entries()) {
            if (lock.socketId === socketId) {
                this.locks.delete(itemId);
                released.push(itemId);
            }
        }
        return released;
    }

    heartbeat(itemId: string, userId: string) {
        const existing = this.locks.get(itemId);
        if (existing && existing.userId === userId) {
            existing.acquiredAt = Date.now();
        }
    }

    getAll(): Map<string, LockInfo> {
        return this.locks;
    }
}

export const lockManager = new LockManager();