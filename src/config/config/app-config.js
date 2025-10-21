const path = require("path");
require("dotenv").config();

const config = {
  root: path.join(__dirname, "/../../"),
  views: path.join(__dirname, "/../views"),
  controllers: path.join(__dirname, "/../controllers"),
  sqlCon: {
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASS,
    database: process.env.DATABASE_NAME,
    port: process.env.DATABASE_PORT,
    charset: "utf8mb4",
  },
  populateCon: {
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASS,
    database: process.env.DATABASE_NAME,
    port: process.env.DATABASE_PORT,
    charset: "utf8mb4",
    multipleStatements: true,
  },
};

module.exports = config;
