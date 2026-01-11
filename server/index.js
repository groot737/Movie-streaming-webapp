import "dotenv/config";
import { getAuthApp } from "./authApp.js";

const PORT = process.env.PORT || 3001;
const app = getAuthApp();

app.listen(PORT, () => {
  console.log(`Auth server running on port ${PORT}`);
});
