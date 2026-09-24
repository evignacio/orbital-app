let config;
try {
  config = require("./config");
} catch (err) {
  console.error(`Configuration error: ${err.message}`);
  process.exit(1);
}
const express = require("express");
const applicationsRouter = require("./routes/applications");

const app = express();
const PORT = config.port;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
app.use(express.json());
app.use("/applications", applicationsRouter);

app.listen(PORT, () => {
  console.log(`Orbital API running on http://localhost:${PORT}`);
});
