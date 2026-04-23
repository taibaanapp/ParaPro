import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API to fetch Gold and Currency rates
  app.get("/api/market-data", async (req, res) => {
    try {
      // Fetch Exchange Rate (USD/THB)
      const exRateResponse = await axios.get("https://open.er-api.com/v6/latest/USD");
      const thbRate = exRateResponse.data.rates.THB;

      // Fetch Thai Gold Price
      let goldPrice = null;
      const goldApiUrls = [
        "https://api.chnwt.dev/thai-gold-api/latest",
        "https://thai-gold-api.vercel.app/latest",
        "https://api.gold-price-th.com/latest"
      ];

      for (const url of goldApiUrls) {
        try {
          const goldResponse = await axios.get(url, { timeout: 5000 });
          const data = goldResponse.data;
          
          let priceObj = null;
          // Check for common Thai Gold API response formats
          if (data.response?.price) priceObj = data.response.price;
          else if (data.price) priceObj = data.price;
          else if (data.gold_bar) priceObj = data;
          else if (data.data?.gold_bar) priceObj = data.data;

          if (priceObj && priceObj.gold_bar) {
            const buyVal = priceObj.gold_bar.buy;
            const sellVal = priceObj.gold_bar.sell;
            
            const buy = typeof buyVal === 'string' ? parseInt(buyVal.replace(/,/g, '')) : buyVal;
            const sell = typeof sellVal === 'string' ? parseInt(sellVal.replace(/,/g, '')) : sellVal;
            
            if (buy > 0 && sell > 0) {
              goldPrice = { buy, sell };
              break;
            }
          }
        } catch (e) {
          // Silently fail to next API
        }
      }

      res.json({
        usdRate: thbRate,
        goldPrice,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Market data fetch error:", error);
      res.status(500).json({ error: "Failed to fetch market data" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
