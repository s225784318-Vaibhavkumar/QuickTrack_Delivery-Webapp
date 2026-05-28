const mongoose = require("mongoose");

const CoordinateSchema = new mongoose.Schema({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
});

const TrackingSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true },
  status: { type: String, enum: ["In-Transit", "Delivered"], default: "In-Transit" },
  coordinates: [CoordinateSchema],
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
});

module.exports = mongoose.model("TrackingSession", TrackingSessionSchema);
