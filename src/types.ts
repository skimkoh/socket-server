export interface LockInfo {
    itemId: string;
    userId: string;
    userName: string;
    socketId: string;
    acquiredAt: number;
}

export interface ServerToClientEvents {
    "lock:acquired": (lock: LockInfo) => void;
    "lock:released": (itemId: string) => void;
    "lock:status": (locks: Record<string, LockInfo | null>) => void;
}

export interface ClientToServerEvents {
    "lock:acquire": (
        payload: { itemId: string; userId: string; userName: string },
        ack: (result: { ok: boolean; lock: LockInfo | null }) => void
    ) => void;
    "lock:release": (payload: { itemId: string; userId: string }) => void;
    "lock:heartbeat": (payload: { itemId: string; userId: string }) => void;
    "lock:subscribe": (itemIds: string[]) => void;
    "lock:unsubscribe": (itemIds: string[]) => void;
}