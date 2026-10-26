import mongoose from 'mongoose';

export async function connectDB(uri = process.env.mongoURI) {
  if (!uri) throw new Error('mongoURI is not set');
  await mongoose.connect(uri);
  console.log('Connected successfully to MongoDB');
}
