const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

let mongodInstance = null;
let dbInfo = {
  connected: false,
  mode: "disconnected",
  uri: "",
  host: "",
  port: null,
  storagePath: "",
};

const connectDB = async () => {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/smart_classroom";
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 2000,
    });
    console.log("✅ External MongoDB connected successfully at:", mongoose.connection.host);
    dbInfo = {
      connected: true,
      mode: "external",
      uri,
      host: mongoose.connection.host,
      port: mongoose.connection.port || 27017,
      storagePath: "External MongoDB Server (127.0.0.1:27017)",
    };
  } catch (err) {
    console.warn("ℹ️  External MongoDB at 127.0.0.1:27017 not available (" + err.message + ").");
    console.log("🚀 Initializing persistent local database engine (WiredTiger with permanent disk storage)...");

    const dataDir = path.resolve(__dirname, "../data/db");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    try {
      const { MongoMemoryServer } = require("mongodb-memory-server");

      const instanceConfig = {
        dbPath: dataDir,
        storageEngine: "wiredTiger",
        dbName: "smart_classroom",
      };

      // Try binding to standard port 27017 first so tools can connect
      try {
        mongodInstance = await MongoMemoryServer.create({
          instance: { ...instanceConfig, port: 27017 },
          cleanup: { doCleanup: false },
        });
      } catch (portErr) {
        console.log("Port 27017 occupied, using dynamic port for embedded engine...");
        mongodInstance = await MongoMemoryServer.create({
          instance: instanceConfig,
          cleanup: { doCleanup: false },
        });
      }

      const rawUri = mongodInstance.getUri();
      const connUri = rawUri.endsWith("/") ? `${rawUri}smart_classroom` : `${rawUri}/smart_classroom`;

      await mongoose.connect(connUri);
      console.log("✅ Persistent Database connected successfully at:", connUri);
      console.log("📁 Permanent storage location on disk:", dataDir);

      dbInfo = {
        connected: true,
        mode: "embedded-persistent",
        uri: connUri,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        storagePath: dataDir,
      };

      const handleCleanExit = async () => {
        if (mongodInstance) {
          try {
            await mongoose.disconnect();
            await mongodInstance.stop({ doCleanup: false });
          } catch {}
        }
        process.exit(0);
      };

      process.once("SIGINT", handleCleanExit);
      process.once("SIGTERM", handleCleanExit);
      process.once("SIGUSR2", async () => {
        if (mongodInstance) {
          try {
            await mongoose.disconnect();
            await mongodInstance.stop({ doCleanup: false });
          } catch {}
        }
        process.kill(process.pid, "SIGUSR2");
      });
    } catch (memErr) {
      console.error("❌ Failed to start persistent database engine:", memErr.message);
      dbInfo = { connected: false, error: memErr.message };
      process.exit(1);
    }
  }

  // Seed sample data if database is empty (first run only)
  try {
    const seedInitialData = require("./seed");
    await seedInitialData();
  } catch (seedErr) {
    console.warn("Seeding notice:", seedErr.message);
  }
};

const getDBInfo = () => dbInfo;

module.exports = connectDB;
module.exports.getDBInfo = getDBInfo;
