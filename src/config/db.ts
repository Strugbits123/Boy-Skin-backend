import dotenv from "dotenv";
dotenv.config();
import { MongoClient, Db } from "mongodb";
import type { MongoClientOptions } from "mongodb";
const logger = console;

const MONGO_URI = process.env.MONGODB_URI as string;
const DB_NAME = process.env.DB_NAME as string;

if (!MONGO_URI) {
    throw new Error("MONGO_URI environment variable is not set.");
}
if (!DB_NAME) {
    throw new Error("MONGO_DB_NAME environment variable is not set.");
}

const options: MongoClientOptions = {
    tls: false,
    connectTimeoutMS: 20000,
    socketTimeoutMS: 60000,
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
};

let client: MongoClient | null = null;
let database: Db | null = null;

class DatabaseConfig {
    static async connectToDatabase(retries = 5, delay = 2000): Promise<Db> {
        if (database) {
            logger.info(`Database already connected: ${database.databaseName}`);
            return database;
        }
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                client = new MongoClient(MONGO_URI, options);
                await client.connect();
                database = client.db(DB_NAME);
                logger.info("Database connected successfully: ", database.databaseName);
                process.on("SIGINT", DatabaseConfig.closeConnection);
                process.on("SIGTERM", DatabaseConfig.closeConnection);
                return database;
            } catch (error) {
                logger.error(`Database connection attempt ${attempt} failed: ${error}`);
                if (attempt < retries) {
                    await new Promise(res => setTimeout(res, delay));
                } else {
                    throw new Error("Failed to connect to database after multiple attempts.");
                }
            }
        }
        throw new Error("Unexpected error in database connection logic.");
    }

    static async getDatabase(): Promise<Db> {
        if (!database) {
            return await DatabaseConfig.connectToDatabase();
        }
        return database;
    }

    static async closeConnection() {
        if (client) {
            await client.close();
            logger.info("Database connection closed.");
            client = null;
            database = null;
        }
        process.exit(0);
    }
}

export default DatabaseConfig;