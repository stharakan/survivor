import { MongoClient, Db } from 'mongodb'

if (!process.env.MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"')
}

const uri = process.env.MONGODB_URI
const options = {
  // Connection options for better reliability in production
  maxPoolSize: 10, // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
}

let client: MongoClient
let clientPromise: Promise<MongoClient>

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  const globalWithMongoDB = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>
  }

  if (!globalWithMongoDB._mongoClientPromise) {
    client = new MongoClient(uri, options)
    globalWithMongoDB._mongoClientPromise = client.connect()
  }
  clientPromise = globalWithMongoDB._mongoClientPromise
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options)
  clientPromise = client.connect()
}

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
export default clientPromise

// Helper function to get the database
export async function getDatabase(): Promise<Db> {
  const client = await clientPromise
  return client.db(process.env.MONGODB_DB_NAME || 'survivor-league')
}

// Database collections
export const Collections = {
  USERS: 'users',
  LEAGUES: 'leagues',
  LEAGUE_MEMBERSHIPS: 'league_memberships',
  TEAMS: 'teams',
  GAMES: 'games',
  PICKS: 'picks',
  JOIN_REQUESTS: 'join_requests',
  LEAGUE_INVITATIONS: 'league_invitations',
} as const