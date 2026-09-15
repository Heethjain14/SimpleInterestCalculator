const { MongoClient } = require('mongodb');

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
