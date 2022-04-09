const bodyParser = require("body-parser");
const express = require("express");
const routes = require("./routes");
const axios = require("axios");
const axiosThrottle = require("axios-request-throttle");
const cors = require("cors");
const axiosRetry = require("axios-retry");

axios.interceptors.request.use((request) => {
    console.log("Requested");
    return request;
});

axiosThrottle.use(axios, { requestsPerSecond: 1 });

axiosRetry(axios, {
    retries: 3,
    retryDelay: (retryCount) => retryCount * 1000,
});

const app = express();

app.use(cors());

app.use(bodyParser.json());

app.use("/", routes);

app.use((err, req, res, next) => {
    //Log Error
    console.error(err);
    res.status(500).send({
        code: 500,
        error: err,
    });
});

module.exports = app;
