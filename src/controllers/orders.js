
const pool = require("../config/database.js");

const controller = class OrdersController {
  async create(user) {
    const connection = await pool.getConnection();
    try {
      const [result] = await connection.query(
        "INSERT INTO orders SET ?",
        [user]
      );
      return result.insertId;
    } finally {
      connection.release();
    }
  }

  async saveOrderProducts(orderId, cartContent) {
    const connection = await pool.getConnection();
    try {
      // Format data
      const formattedData = cartContent.map(({ id, quantity, size }) => [
        orderId,
        parseInt(id),
        quantity,
        size,
      ]);
      
      await connection.query(
        "INSERT INTO orders_items VALUES ?",
        [formattedData]
      );
      
      return "Order products saved";
    } finally {
      connection.release();
    }
  }
};

module.exports = controller;