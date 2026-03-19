import dotenv from "dotenv";
import path from "path";
import { resetBudget } from "./hub_client";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const APIKEY = process.env.AIDEVS_KEY;
if (!APIKEY) throw new Error("Brak AIDEVS_KEY w .env");

resetBudget(APIKEY)
  .then((result) => {
    console.log("Reset:", result);
  })
  .catch(console.error);
