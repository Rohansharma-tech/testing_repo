// =============================================
// routes/settings.js - Settings & Face Routes
// =============================================

const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const { getGeofenceConfig } = require("../utils/attendance");

function normalizeFaceDescriptor(faceDescriptor) {
  if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
    return null;
  }

  const normalized = faceDescriptor.map((value) => Number(value));
  return normalized.every((value) => Number.isFinite(value)) ? normalized : null;
}

// ---- GET /api/settings/geofence ----
router.get("/geofence", protect, (req, res) => {
  const geofence = getGeofenceConfig();

  res.json({
    latitude: geofence.latitude,
    longitude: geofence.longitude,
    radius: geofence.radius,
    maxAccuracyMeters: geofence.maxAccuracyMeters,
    maxLocationAgeMs: geofence.maxLocationAgeMs,
    timeZone: geofence.timeZone,
  });
});

// ---- GET /api/settings/face-descriptor ----
router.get("/face-descriptor", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("faceDescriptor hasFace name");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (!user.hasFace || !Array.isArray(user.faceDescriptor) || user.faceDescriptor.length === 0) {
      return res.status(400).json({ message: "No face registered. Please register your face first." });
    }

    return res.json({
      faceDescriptor: user.faceDescriptor,
      name: user.name,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch face data." });
  }
});

// ---- PUT /api/settings/register-face ----
router.put("/register-face", protect, async (req, res) => {
  const faceDescriptor = normalizeFaceDescriptor(req.body.faceDescriptor);

  if (!faceDescriptor) {
    return res.status(400).json({ message: "A valid 128-value face descriptor array is required." });
  }

  try {
    const user = await User.findById(req.user.id).select("hasFace faceDescriptor");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.hasFace || user.faceDescriptor.length > 0) {
      return res.status(409).json({ message: "Face already registered" });
    }

    await User.findByIdAndUpdate(
      req.user.id,
      {
        faceDescriptor,
        hasFace: true,
      },
      { runValidators: true }
    );

    return res.json({ message: "Face registered successfully." });
  } catch (err) {
    return res.status(500).json({ message: "Failed to register face." });
  }
});

module.exports = router;
