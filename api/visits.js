import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

// ---- Mongoose Connection Cache (for serverless) ----
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
    }).then((mongoose) => mongoose);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// ---- Schemas ----

// Main visitor counter
const VisitorSchema = new mongoose.Schema({
  name: { type: String, default: "portfolio" },
  count: { type: Number, default: 0 },
});

// Each visit log (time, IP, browser)
const VisitLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  ip: String,
  userAgent: String,
});

export default async function handler(req, res) {
  // ✅ Allow CORS for your React app
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  try {
    await connectDB();

    const Visitor =
      mongoose.models.Visitor || mongoose.model("Visitor", VisitorSchema);
    const VisitLog =
      mongoose.models.VisitLog || mongoose.model("VisitLog", VisitLogSchema);

    // Get IP and user agent
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket?.remoteAddress ||
      "unknown";

    const userAgent = req.headers["user-agent"] || "unknown";

    // Find or create visitor counter
    let doc = await Visitor.findOne({ name: "portfolio" });
    if (!doc) doc = new Visitor();

    // Increment and save total visits
    doc.count += 1;
    await doc.save();

    // Save visit log
    await VisitLog.create({ ip, userAgent });

    // Fetch latest 5 logs (most recent first)
    const latestLogs = await VisitLog.find()
      .sort({ timestamp: -1 })
      .limit(5)
      .lean();

    // Return response
    res.status(200).json({
      visits: doc.count,
      recentVisits: latestLogs,
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Database connection failed" });
  }
}
