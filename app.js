const bodyParser = require("body-parser");
const express = require("express");
const routes = require("./routes");
const axios = require("axios");
const axiosThrottle = require("axios-request-throttle");

axios.interceptors.request.use((request) => {
    console.log("Requested");
    return request;
});

axiosThrottle.use(axios, { requestsPerSecond: 1 });

const app = express();

app.use(bodyParser.json());

app.use("/", routes);

app.use((err, req, res, next) => {
    console.error(err);
});

module.exports = app;
