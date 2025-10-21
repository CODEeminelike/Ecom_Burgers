
const mysql = require("mysql2/promise");
require("dotenv").config();

// TẠO CONNECTION POOL (tái sử dụng connections)
const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASS,
  database: process.env.DATABASE_NAME,
  port: process.env.DATABASE_PORT,
  charset: "utf8mb4",
  
  //  CẤU HÌNH POOL
  connectionLimit: 10,        // Tối đa 10 connections đồng thời
  waitForConnections: true,   // Chờ nếu hết connection
  queueLimit: 0,              // Không giới hạn queue
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  
  //  BẢO MẬT
  connectTimeout: 10000,      // Timeout 10s
  acquireTimeout: 10000,
});

//  TEST CONNECTION KHI KHỞI ĐỘNG
pool.getConnection()
  .then((connection) => {
    console.log(" Database connected successfully");
    connection.release();
  })
  .catch((err) => {
    console.error(" Database connection failed:", err.message);
    process.exit(1);
  });

//  XỬ LÝ ĐÓNG POOL KHI TẮT SERVER
process.on("SIGINT", async () => {
  try {
    await pool.end();
    console.log("🔌 Database pool closed");
    process.exit(0);
  } catch (err) {
    console.error("Error closing pool:", err);
    process.exit(1);
  }
});

module.exports = pool;