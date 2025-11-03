import mongoose from "mongoose";
import dotenv from "dotenv";
import {UAParser} from "ua-parser-js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

// --- Database Connection (cached for Vercel) ---
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }).then(mongoose => mongoose);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// --- Schema ---
const VisitLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  ip: String,
  city: String,
  region: String,
  country: String,
  timezone: String,
  userAgent: String,
  device: String, // mobile / tablet / desktop
});

const VisitorSchema = new mongoose.Schema({
  name: { type: String, default: "portfolio" },
  count: { type: Number, default: 0 },
});

export default async function handler(req, res) {
  await connectDB();

  const Visitor =
    mongoose.models.Visitor || mongoose.model("Visitor", VisitorSchema);
  const VisitLog =
    mongoose.models.VisitLog || mongoose.model("VisitLog", VisitLogSchema);

  // --- Extract IP & User-Agent ---
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket?.remoteAddress ||
    "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";

  // --- Parse device info ---
  const parser = new UAParser(userAgent);
  const deviceType = parser.getDevice().type || "desktop"; // default to desktop

  // --- Get geo info (city, country, timezone) ---
  let geo = {};
  try {
    const response = await fetch(`https://ipapi.co/${ip}/json/`);
    if (response.ok) {
      geo = await response.json();
    }
  } catch (err) {
    console.error("Geo lookup failed:", err);
  }

  // --- Update total count ---
  let doc = await Visitor.findOne({ name: "portfolio" });
  if (!doc) doc = new Visitor();
  doc.count += 1;
  await doc.save();

  // --- Save visit log ---
  const visit = new VisitLog({
    ip,
    userAgent,
    device: deviceType,
    city: geo.city || "unknown",
    region: geo.region || "unknown",
    country: geo.country_name || "unknown",
    timezone: geo.timezone || "unknown",
  });
  await visit.save();

  // --- Get last 5 visits ---
  const latestLogs = await VisitLog.find()
    .sort({ timestamp: -1 })
    .limit(5)
    .select("-_id ip city region country timezone device timestamp");

  res.status(200).json({
    totalVisits: doc.count,
    latest: latestLogs,
  });
}
