// =============================================
// server.js — Main Entry Point for Backend
// =============================================

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

// Load environment variables from .env file
dotenv.config();

const app = express();

// ---- Middleware ----
// Allow requests from the React frontend (port 5173 by default with Vite)
app.use(cors({ origin: "*" }));

// Parse incoming JSON request bodies
app.use(express.json({ limit: "10mb" })); // 10mb limit for face descriptor payloads

// ---- Routes ----
// Import route handlers
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const attendanceRoutes = require("./routes/attendance");
const settingsRoutes = require("./routes/settings");

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

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ Connected to MongoDB");

    // Auto-create a default admin user if none exists
    await createDefaultAdmin();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📍 Geofence: ${process.env.GEOFENCE_LAT}, ${process.env.GEOFENCE_LNG} (${process.env.GEOFENCE_RADIUS}m radius)`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
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
