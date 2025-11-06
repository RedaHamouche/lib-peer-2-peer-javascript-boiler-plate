import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get DB path from environment or use default
const DB_PATH =
  process.env.DB_PATH ||
  join(
    __dirname,
    "..",
    "data",
    `peer-db-${process.env.NODE_NAME || "default"}.db`
  );

// Ensure directory exists
const dbDir = dirname(DB_PATH);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);

// Create peers table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS peers (
    peer_id TEXT PRIMARY KEY,
    addresses TEXT NOT NULL,
    last_seen INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_last_seen ON peers(last_seen);
`);

// Helper functions
export const dbOperations = {
  // Save or update a peer
  savePeer: (peerId, addresses) => {
    const stmt = db.prepare(
      "INSERT OR REPLACE INTO peers (peer_id, addresses, last_seen) VALUES (?, ?, ?)"
    );
    stmt.run(peerId, JSON.stringify(addresses), Date.now());
  },

  // Get a peer by ID
  getPeer: (peerId) => {
    const stmt = db.prepare("SELECT * FROM peers WHERE peer_id = ?");
    const row = stmt.get(peerId);
    if (row) {
      return {
        peerId: row.peer_id,
        addresses: JSON.parse(row.addresses),
        lastSeen: row.last_seen,
        createdAt: row.created_at,
      };
    }
    return null;
  },

  // Get all peers
  getAllPeers: () => {
    const stmt = db.prepare("SELECT * FROM peers ORDER BY last_seen DESC");
    const rows = stmt.all();
    return rows.map((row) => ({
      peerId: row.peer_id,
      addresses: JSON.parse(row.addresses),
      lastSeen: row.last_seen,
      createdAt: row.created_at,
    }));
  },

  // Delete a peer
  deletePeer: (peerId) => {
    const stmt = db.prepare("DELETE FROM peers WHERE peer_id = ?");
    stmt.run(peerId);
  },

  // Update last seen timestamp
  updateLastSeen: (peerId) => {
    const stmt = db.prepare("UPDATE peers SET last_seen = ? WHERE peer_id = ?");
    stmt.run(Date.now(), peerId);
  },

  // Clean old peers (older than 24 hours)
  cleanOldPeers: () => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const stmt = db.prepare("DELETE FROM peers WHERE last_seen < ?");
    const result = stmt.run(oneDayAgo);
    return result.changes;
  },

  // Clean peers that are not in the connected peers list
  cleanDisconnectedPeers: (connectedPeerIds) => {
    if (!connectedPeerIds || connectedPeerIds.size === 0) {
      return 0;
    }

    const connectedIds = Array.from(connectedPeerIds);
    const placeholders = connectedIds.map(() => "?").join(",");
    const stmt = db.prepare(
      `DELETE FROM peers WHERE peer_id NOT IN (${placeholders})`
    );
    const result = stmt.run(...connectedIds);
    return result.changes;
  },

  // Clean old peers (older than specified hours, default 1 hour)
  cleanOldPeersByHours: (hours = 1) => {
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
    const stmt = db.prepare("DELETE FROM peers WHERE last_seen < ?");
    const result = stmt.run(cutoffTime);
    return result.changes;
  },

  // Get all peer IDs from database
  getAllPeerIds: () => {
    const stmt = db.prepare("SELECT peer_id FROM peers");
    const rows = stmt.all();
    return rows.map((row) => row.peer_id);
  },
};

// Close database on process exit
process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  db.close();
  process.exit(0);
});

export default db;
