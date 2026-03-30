// =============================================
// routes/auth.js — Authentication Routes
// POST /api/auth/login
// =============================================

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

function serializeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    hasFace: user.hasFace,
  };
}

// ---- POST /api/auth/login ----
// Logs in a user (admin or regular user) and returns a JWT token
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // Basic validation
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // Compare entered password with stored hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // Create JWT token with user info
    // Token expires in 8 hours (good for a work day)
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    // Send back token and basic user info (never send password!)
    res.json({
      token,
      user: serializeUser(user),
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error during login." });
  }
});

// ---- GET /api/auth/me ----
// Returns the currently logged-in user's info
const { protect } = require("../middleware/auth");

router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -faceDescriptor");
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(serializeUser(user));
  } catch (err) {
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;
