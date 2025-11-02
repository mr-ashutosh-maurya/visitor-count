import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({});

const MONGO_URI = process.env.MONGO_URI;

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGO_URI).then(mongoose => mongoose);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export default async function handler(req, res) {
  await connectDB();

  const VisitorSchema = new mongoose.Schema({
    name: { type: String, default: "portfolio" },
    count: { type: Number, default: 0 },
  });

  const Visitor = mongoose.models.Visitor || mongoose.model("Visitor", VisitorSchema);

  let doc = await Visitor.findOne({ name: "portfolio" });
  if (!doc) doc = new Visitor();
  doc.count += 1;
  await doc.save();
  res.status(200).json({ visits: doc.count });
}
