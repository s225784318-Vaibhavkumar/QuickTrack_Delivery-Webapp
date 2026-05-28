const mongoose = require("mongoose");

const DriverSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  vehicleDetails: { type: String, default: "Standard Vehicle" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Driver", DriverSchema);
