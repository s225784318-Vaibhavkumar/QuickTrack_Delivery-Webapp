
require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// In-memory Database for Sprint 1 (MongoDB in Sprint 2)
const drivers = [];
const activeSessions = {}; // Map session_id to session details

// Initialize mock driver
const initMockDriver = async () => {
  const hashedPassword = await bcrypt.hash("password123", 10);
  drivers.push({
    id: "driver_001",
    email: "driver@test.com",
    password: hashedPassword,
    name: "John Doe",
  });
  console.log("Mock driver created: driver@test.com / password123");
};
initMockDriver();

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
  const driver = drivers.find((d) => d.email === email);

  if (!driver) return res.status(401).json({ error: "Invalid credentials" });

  const validPassword = await bcrypt.compare(password, driver.password);
  if (!validPassword)
    return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { id: driver.id, email: driver.email },
    process.env.JWT_SECRET,
    { expiresIn: "8h" },
  );
  res.json({ token, driverId: driver.id, name: driver.name });
});

// US-02/03: Tracking Session Management
app.post("/api/tracking/start", authenticateToken, (req, res) => {
  const sessionId = `SESSION_${Date.now()}`;
  activeSessions[sessionId] = {
    driverId: req.user.id,
    status: "In-Transit",
    startTime: new Date(),
  };
  res.json({ sessionId, status: "In-Transit" });
});

app.post("/api/tracking/stop", authenticateToken, (req, res) => {
  const { sessionId } = req.body;
  if (activeSessions[sessionId]) {
    activeSessions[sessionId].status = "Delivered";
    activeSessions[sessionId].endTime = new Date();
    // Broadcast delivered status to anyone listening to this session room
    io.to(sessionId).emit("delivery_status_update", { status: "Delivered" });
  }
  res.json({ success: true, message: "Tracking stopped" });
});

app.get("/api/session/:sessionId", (req, res) => {
  const session = activeSessions[req.params.sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session);
});

// --- WebSocket Setup (US-07) ---
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Customer joins a room to listen to a specific delivery
  socket.on("join_session", (sessionId) => {
    socket.join(sessionId);
    console.log(`Socket ${socket.id} joined session room ${sessionId}`);
  });

  // Driver sends location update
  socket.on("driver_location_update", (data) => {
    const { sessionId, lat, lng } = data;
    // Broadcast to customers in the session room (US-04)
    io.to(sessionId).emit("location_update", {
      lat,
      lng,
      timestamp: new Date(),
    });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`Sprint 1 MVP Server running on port ${PORT}`),
);
