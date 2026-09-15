const dns = require('dns');
const { MongoClient } = require('mongodb');

/**
 * mongodb+srv:// URIs need a DNS SRV lookup before any connection is even
 * attempted. On some networks (common on Windows, VPNs, and certain ISP/
 * router DNS servers) the default resolver can't answer SRV queries, which
 * fails with "querySrv ECONNREFUSED ..." before we ever reach Atlas. Routing
 * just the SRV/TXT lookups through a public resolver fixes this in most
 * cases. Override with DNS_SERVERS="1.2.3.4,5.6.7.8" in .env if needed.
 */
dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(','));

let client;
let db;

/** Connects once and reuses the same client/db for the life of the process. */
async function connectDB() {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Copy server/.env.example to server/.env and fill in your Atlas connection string.',
    );
  }

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(process.env.MONGODB_DB || undefined);
  console.log(`Connected to MongoDB database "${db.databaseName}"`);
  return db;
}

/** Every borrower document embeds its loans, and every loan embeds its payments. */
function getBorrowersCollection() {
  if (!db) throw new Error('Database not connected yet - call connectDB() first');
  return db.collection('borrowers');
}

module.exports = { connectDB, getBorrowersCollection };
