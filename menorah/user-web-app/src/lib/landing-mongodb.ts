import { MongoClient } from 'mongodb';

const globalForMongo = globalThis as typeof globalThis & {
  __menorahLandingMongoClientPromise?: Promise<MongoClient>;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export async function getMongoClient() {
  if (!globalForMongo.__menorahLandingMongoClientPromise) {
    const client = new MongoClient(requiredEnv('MONGODB_URI'), {
      serverSelectionTimeoutMS: 5000,
    });
    globalForMongo.__menorahLandingMongoClientPromise = client.connect();
  }
  return globalForMongo.__menorahLandingMongoClientPromise;
}

export async function getLandingDatabase() {
  const client = await getMongoClient();
  return client.db(process.env.MONGO_DATABASE || 'menorah');
}
