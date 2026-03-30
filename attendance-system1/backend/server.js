// =============================================
// server.js — Main Entry Point for Backend
// =============================================
process.stdout.write("[BOOT] server.js starting...\n");

let express, mongoose, cors, dotenv;
try {
  express = require("express");
  mongoose = require("mongoose");
  cors = require("cors");
  dotenv = require("dotenv");
  process.stdout.write("[BOOT] core modules loaded\n");
} catch (e) {
  process.stdout.write("[BOOT ERROR] core module load failed: " + e.message + "\n");
  process.exit(1);
}

// Load environment variables from .env file
dotenv.config();
process.stdout.write("[BOOT] ENV loaded. MONGO_URI set: " + !!process.env.MONGO_URI + "\n");

const app = express();

// ---- Middleware ----
// Allow requests from the React frontend (port 5173 by default with Vite)
app.use(cors({ origin: "*" }));

// Parse incoming JSON request bodies
app.use(express.json({ limit: "10mb" })); // 10mb limit for face descriptor payloads

// ---- Routes ----
// Import route handlers
let authRoutes, userRoutes, attendanceRoutes, settingsRoutes;
try {
  authRoutes = require("./routes/auth");
  process.stdout.write("[BOOT] auth route loaded\n");
  userRoutes = require("./routes/users");
  process.stdout.write("[BOOT] users route loaded\n");
  attendanceRoutes = require("./routes/attendance");
  process.stdout.write("[BOOT] attendance route loaded\n");
  settingsRoutes = require("./routes/settings");
  process.stdout.write("[BOOT] settings route loaded\n");
} catch (e) {
  process.stdout.write("[BOOT ERROR] route load failed: " + e.message + "\n");
  process.exit(1);
}

// Mount routes at their base paths
app.use("/api/auth", authRoutes);         // Login, register
app.use("/api/users", userRoutes);        // User management (admin)
app.use("/api/attendance", attendanceRoutes); // Mark & view attendance
app.use("/api/settings", settingsRoutes); // Geofence settings

// ---- Health Check Route ----
app.get("/", (req, res) => {
  res.json({ message: "Attendance System API is running ✅" });
});

// ---- Connect to MongoDB and Start Server ----
const PORT = process.env.PORT || 5000;

if (!process.env.MONGO_URI) {
  console.log("❌ FATAL: MONGO_URI environment variable is not set!");
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.log("❌ FATAL: JWT_SECRET environment variable is not set! Go to Render -> Environment -> Add JWT_SECRET");
  process.exit(1);
}

process.on("uncaughtException", (err) => {
  console.log("[CRASH] Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.log("[CRASH] Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

console.log(`[BOOT] Starting Express server on port ${PORT}...`);
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("[BOOT] Express is up. Now attempting MongoDB connection...");
  
  mongoose
    .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
    .then(async () => {
      console.log("✅ Connected to MongoDB");
      // Auto-create a default admin user if none exists
      await createDefaultAdmin();
    })
    .catch((err) => {
      console.log("❌ MongoDB connection error:", err.message);
      console.log("   → Verify your Mongo URI and make sure your IP is whitelisted (0.0.0.0/0) in Atlas!");
    });
});

// ---- Default Admin Creator ----
// Creates an admin account on first run so you can log in immediately
async function createDefaultAdmin() {
  const User = require("./models/User");
  const bcrypt = require("bcryptjs");

  const existing = await User.findOne({ role: "admin" });
  if (!existing) {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    await User.create({
      name: "Admin",
      email: "admin@attendance.com",
      password: hashedPassword,
      role: "admin",
    });
    console.log("👤 Default admin created → Email: admin@attendance.com | Password: admin123");
  }
}
