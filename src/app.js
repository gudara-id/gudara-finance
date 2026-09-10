const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { corsOrigins } = require("./config/env");
const authRoutes = require("./routes/authRoutes");
const chartOfAccountsRoutes = require("./routes/chartOfAccountsRoutes");
const journalRoutes = require("./routes/journalRoutes");
const reportsRoutes = require("./routes/reportsRoutes");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (origin && corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin is not allowed"));
    }
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/chart-of-accounts", chartOfAccountsRoutes);
app.use("/api/journals", journalRoutes);
app.use("/api/reports", reportsRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
