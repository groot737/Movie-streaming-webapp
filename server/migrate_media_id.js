
import "dotenv/config";
import { pool } from "./db.js";

const migrate = async () => {
    try {
        console.log("Starting migration...");
        await pool.query("ALTER TABLE rooms ALTER COLUMN media_id TYPE VARCHAR(50)");
        console.log("Migration successful: rooms.media_id is now VARCHAR(50).");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        process.exit();
    }
};

migrate();
