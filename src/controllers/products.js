
const pool = require("../config/database.js");

const controller = class ProductsController {
  // XÓA constructor cũ

  async getAll() {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query("SELECT * FROM `products`");
      
      if (rows.length < 1) {
        throw new Error("No registered products");
      }
      
      return rows;
    } finally {
      connection.release();
    }
  }

  async getAllWithSizes() {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        "SELECT * FROM `sizes` JOIN products ON sizes.product_id = products.id"
      );
      
      if (rows.length < 1) {
        throw new Error("No registered products");
      }
      
      return rows;
    } finally {
      connection.release();
    }
  }

  async getProduct(id) {
    // ✅ VALIDATE ID
    if (!id || isNaN(id)) {
      throw new Error("Invalid product ID: " + id);
    }

    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        "SELECT * FROM products JOIN sizes ON products.id = sizes.product_id WHERE products.id = ?",
        [id]
      );
      
      if (!rows || rows.length < 1) {
        throw new Error("Product not found - ID: " + id);
      }
      
      return rows;
    } finally {
      connection.release();
    }
  }

  async getByIdArray(idList) {
    const connection = await pool.getConnection();
    try {
      // ✅ PARAMETERIZED QUERY để tránh SQL Injection
      const placeholders = idList.split(',').map(() => '?').join(',');
      const ids = idList.split(',');
      
      const [rows] = await connection.query(
        `SELECT id, title, sizes.size, sizes.price FROM products JOIN sizes ON products.id = sizes.product_id WHERE id IN (${placeholders})`,
        ids
      );
      
      if (rows.length === 0) {
        throw new Error("Products not registered");
      }
      
      return rows;
    } finally {
      connection.release();
    }
  }

  async checkStock(id, size) {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        "SELECT stock FROM sizes WHERE product_id = ? AND size = ?",
        [id, size]
      );
      
      if (rows.length < 1) {
        throw new Error("Product not registered");
      }
      
      return rows[0];
    } finally {
      connection.release();
    }
  }

  async updateAllDetails(product, sizes, id) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction(); // ← TRANSACTION để đảm bảo consistency
      
      await this.updateProductInTx(connection, product, id);
      
      for (let size of sizes) {
        await this.updateSizesInTx(connection, size, id);
      }
      
      await connection.commit();
      return "Product updated successfully!";
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  async updateProductInTx(connection, product, id) {
    await connection.query(
      "UPDATE `products` SET ? WHERE `id` = ?",
      [product, id]
    );
  }

  async updateSizesInTx(connection, size, id) {
    await connection.query(
      "UPDATE `sizes` SET ? WHERE `product_id` = ? AND `size` = ?",
      [size, id, size.size]
    );
  }

  async updateProduct(product, id) {
    const connection = await pool.getConnection();
    try {
      await connection.query(
        "UPDATE `products` SET ? WHERE `id` = ?",
        [product, id]
      );
    } finally {
      connection.release();
    }
  }

  async updateSizes(size, id) {
    const connection = await pool.getConnection();
    try {
      await connection.query(
        "UPDATE `sizes` SET ? WHERE `product_id` = ? AND `size` = ?",
        [size, id, size.size]
      );
    } finally {
      connection.release();
    }
  }

  async getPaginated(page) {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        "SELECT * FROM `products` ORDER BY ID ASC LIMIT 3 OFFSET ?",
        [page * 3]
      );
      
      if (!rows || rows.length < 1) {
        throw new Error("No products found");
      }
      
      return rows;
    } finally {
      connection.release();
    }
  }

  async outOfStock() {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        "SELECT * FROM `sizes` RIGHT JOIN products ON sizes.product_id = products.id WHERE sizes.stock = 0"
      );
      
      if (rows.length < 1) {
        throw new Error("All products in stock!");
      }
      
      return rows;
    } finally {
      connection.release();
    }
  }
};

module.exports = controller;