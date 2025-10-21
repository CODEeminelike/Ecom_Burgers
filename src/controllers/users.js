
const pool = require("../config/database.js");
const jwt = require("jsonwebtoken");

const controller = class UsersController {
  // XÓA constructor cũ
  // constructor() {
  //   this.con = mysql.createConnection(config.sqlCon);
  // }

  generateAccessToken(user) {
    return jwt.sign(
      { id: user.id, email: user.email, user_type: user.user_type },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "15m" }
    );
  }

  generateRefreshToken(user) {
    return jwt.sign(
      { id: user.id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" }
    );
  }

  async saveRefreshToken(userId, refreshToken) {
    const connection = await pool.getConnection();
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      await connection.query(
        "INSERT INTO user_tokens (user_id, token, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE token = ?, expires_at = ?",
        [userId, refreshToken, expiresAt, refreshToken, expiresAt]
      );
    } finally {
      connection.release();
    }
  }

  async deleteRefreshToken(token) {
    const connection = await pool.getConnection();
    try {
      await connection.query(
        "DELETE FROM user_tokens WHERE token = ?",
        [token]
      );
    } finally {
      connection.release();
    }
  }

  async getUserByRefreshToken(token) {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        "SELECT u.* FROM users u JOIN user_tokens ut ON u.id = ut.user_id WHERE ut.token = ? AND ut.expires_at > NOW()",
        [token]
      );
      
      if (rows.length === 0) {
        throw new Error("Invalid refresh token");
      }
      
      return rows[0];
    } finally {
      connection.release();
    }
  }

  async getUserByEmail(email) {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        "SELECT * FROM `users` WHERE `email` = ?",
        [email]
      );
      
      if (rows.length < 1) {
        throw new Error("User not found");
      }
      
      return rows[0];
    } finally {
      connection.release();
    }
  }

  async getUserById(id) {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        "SELECT * FROM `users` WHERE `id` = ?",
        [id]
      );
      
      if (rows.length < 1) {
        throw new Error("No user with that id");
      }
      
      return rows[0];
    } finally {
      connection.release();
    }
  }

  async save(user) {
    const connection = await pool.getConnection();
    try {
      const [result] = await connection.query(
        "INSERT INTO users SET ?",
        [user]
      );
      return result.insertId;
    } finally {
      connection.release();
    }
  }

  async isAdmin(id) {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        "SELECT user_type FROM `users` WHERE `id` = ?",
        [id]
      );
      
      if (rows.length === 0) {
        throw new Error("User not found");
      }
      
      return rows[0].user_type; // ← Trả về user_type, không phải boolean
    } finally {
      connection.release();
    }
  }

  async getEmployees() {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        'SELECT * FROM `users` WHERE `user_type` != "customer"'
      );
      return rows;
    } finally {
      connection.release();
    }
  }

  async updateEmployee(user, id) {
    const connection = await pool.getConnection();
    try {
      await connection.query(
        "UPDATE `users` SET ? WHERE `id` = ?",
        [user, id]
      );
      return "User updated successfully!";
    } finally {
      connection.release();
    }
  }

  async update(name, email, id) {
    const connection = await pool.getConnection();
    try {
      await connection.query(
        "UPDATE `users` SET name = ?, email = ? WHERE `id` = ?",
        [name, email, id]
      );
      return "User updated successfully!";
    } finally {
      connection.release();
    }
  }

  async updatePassword(password, id) {
    const connection = await pool.getConnection();
    try {
      await connection.query(
        "UPDATE `users` SET password = ? WHERE `id` = ?",
        [password, id]
      );
      return "Password updated successfully!";
    } finally {
      connection.release();
    }
  }
};

module.exports = controller;