
require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const mongoose = require("mongoose");

// Load Mongoose models
const Driver = require("./models/Driver");
const TrackingSession = require("./models/TrackingSession");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// MongoDB Database Connection
const MONGODB_URI = process.env.MONGODB_URI;

const connectToDatabase = async () => {
  if (!MONGODB_URI) {
    console.error(
      "Missing MONGODB_URI in .env. Add your MongoDB Atlas connection string before starting the server.",
    );
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB database successfully.");
    await initMockDriver();
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
};

// Initialize mock driver if none exist
const initMockDriver = async () => {
  try {
    const existingDriver = await Driver.findOne({ email: "driver@test.com" });
    if (!existingDriver) {
      const hashedPassword = await bcrypt.hash("password123", 10);
      const mockDriver = new Driver({
        name: "John Doe",
        email: "driver@test.com",
        password: hashedPassword,
        vehicleDetails: "Toyota Prius (White) - Plate: QT-8899",
      });
      await mockDriver.save();
      console.log("Mock driver seeded in DB: driver@test.com / password123");
    } else {
      console.log("Mock driver already exists in DB.");
    }
  } catch (err) {
    console.error("Error seeding mock driver:", err);
  }
};

// --- Authentication Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Access denied" });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
};

// --- REST API Endpoints ---

// US-01: Driver Login API
app.post("/api/driver/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const driver = await Driver.findOne({ email });
    if (!driver) return res.status(401).json({ error: "Invalid credentials" });

    const validPassword = await bcrypt.compare(password, driver.password);
    if (!validPassword)
      return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: driver._id, email: driver.email },
      process.env.JWT_SECRET,
      { expiresIn: "8h" },
    );
    res.json({ token, driverId: driver._id, name: driver.name, vehicle: driver.vehicleDetails });
  } catch (err) {
    res.status(500).json({ error: "Server error during authentication" });
  }
});

// Get Driver Profile Detail
app.get("/api/driver/profile", authenticateToken, async (req, res) => {
  try {
    const driver = await Driver.findById(req.user.id).select("-password");
    if (!driver) return res.status(404).json({ error: "Driver not found" });
    res.json(driver);
  } catch (err) {
    res.status(500).json({ error: "Server error fetching profile" });
  }
});

// Update Driver Profile
app.put("/api/driver/profile", authenticateToken, async (req, res) => {
  const { name, vehicleDetails } = req.body;
  try {
    const driver = await Driver.findByIdAndUpdate(
      req.user.id,
      { name, vehicleDetails },
      { new: true }
    ).select("-password");
    res.json(driver);
  } catch (err) {
    res.status(500).json({ error: "Server error updating profile" });
  }
});

// US-02/03: Tracking Session Management
app.post("/api/tracking/start", authenticateToken, async (req, res) => {
  const sessionId = `SESSION_${Date.now()}`;
  try {
    const session = new TrackingSession({
      sessionId,
      driverId: req.user.id,
      status: "In-Transit",
      startTime: new Date(),
    });
    await session.save();
    res.json({ sessionId, status: "In-Transit" });
  } catch (err) {
    res.status(500).json({ error: "Error starting tracking session" });
  }
});

app.post("/api/tracking/stop", authenticateToken, async (req, res) => {
  const { sessionId } = req.body;
  try {
    const session = await TrackingSession.findOneAndUpdate(
      { sessionId },
      { status: "Delivered", endTime: new Date() },
      { new: true }
    );
    if (session) {
      io.to(sessionId).emit("delivery_status_update", { status: "Delivered" });
    }
    res.json({ success: true, message: "Tracking stopped" });
  } catch (err) {
    res.status(500).json({ error: "Error stopping tracking session" });
  }
});

app.get("/api/session/:sessionId", async (req, res) => {
  try {
    const session = await TrackingSession.findOne({ sessionId: req.params.sessionId }).populate("driverId", "name vehicleDetails");
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: "Error fetching session details" });
  }
});

// --- WebSocket Setup ---
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Customer/Driver joins session room
  socket.on("join_session", (sessionId) => {
    socket.join(sessionId);
    console.log(`Socket ${socket.id} joined room ${sessionId}`);
  });

  // Driver sends location update
  socket.on("driver_location_update", async (data) => {
    const { sessionId, lat, lng } = data;
    
    // Broadcast immediately to customers listening (real-time experience)
    io.to(sessionId).emit("location_update", {
      lat,
      lng,
      timestamp: new Date(),
    });

    // Persist coordinates in background to coordinate history array in MongoDB
    try {
      await TrackingSession.findOneAndUpdate(
        { sessionId },
        { $push: { coordinates: { lat, lng, timestamp: new Date() } } }
      );
    } catch (err) {
      console.error("Error logging coordinates to MongoDB:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

connectToDatabase().then(() => {
  server.listen(PORT, () =>
    console.log(`Sprint 2 Server running on port ${PORT}`),
  );
});
