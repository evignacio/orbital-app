const express = require("express");
const cors = require("./middlewares/cors.middleware");
const requestLogger = require("./middlewares/request-logger.middleware");
const errorHandler = require("./middlewares/error-handler.middleware");
const applicationsRoutes = require("./routes/applications.routes");

const app = express();

app.use(cors);
app.use(requestLogger);
app.use(express.json({ limit: "10kb", strict: true }));
app.use("/applications", applicationsRoutes);
app.use(errorHandler);

module.exports = app;
