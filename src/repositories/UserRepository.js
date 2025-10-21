
const pool = require("../config/database.js"); // ← SỬA: Import pool

class UserRepository {
  //  XÓA constructor cũ:
  // constructor() {
  //   this.con = mysql.createConnection(config.sqlCon);
  // }

  // MỖI METHOD LẤY CONNECTION TỪ POOL
  async save(user) {
    const connection = await pool.getConnection();
    try {
      const [result] = await connection.query(
        "INSERT INTO users SET ?",
        [user]
      );
      return result;
    } catch (err) {
      throw new Error(`Error saving user: ${err.message}`);
    } finally {
      connection.release(); // ← QUAN TRỌNG: Trả connection về pool
    }
  }

  async getUserByEmail(email) {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        "SELECT * FROM users WHERE email = ?",
        [email]
      );
      
      if (rows.length < 1) {
        throw new Error("User not found");
      }
      
      return rows[0];
    } catch (err) {
      if (err.message === "User not found") throw err;
      throw new Error(`Database error: ${err.message}`);
    } finally {
      connection.release();
    }
  }

  async getUserById(id) {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        "SELECT * FROM users WHERE id = ?",
        [id]
      );
      
      if (rows.length < 1) {
        throw new Error("User not found");
      }
      
      return rows[0];
    } finally {
      connection.release();
    }
  }

  async isAdmin(id) {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        "SELECT user_type FROM users WHERE id = ?",
        [id]
      );
      
      if (rows.length < 1) {
        throw new Error("User not found");
      }
      
      return rows[0].user_type === "admin";
    } finally {
      connection.release();
    }
  }

  async update(name, email, userId) {
    const connection = await pool.getConnection();
    try {
      const [result] = await connection.query(
        "UPDATE users SET name = ?, email = ? WHERE id = ?",
        [name, email, userId]
      );
      
      if (result.affectedRows === 0) {
        throw new Error("User not found");
      }
      
      return "Success";
    } finally {
      connection.release();
    }
  }

  async updatePassword(hashedPassword, userId) {
    const connection = await pool.getConnection();
    try {
      const [result] = await connection.query(
        "UPDATE users SET password = ? WHERE id = ?",
        [hashedPassword, userId]
      );
      
      if (result.affectedRows === 0) {
        throw new Error("User not found");
      }
      
      return "Success";
    } finally {
      connection.release();
    }
  }

  async getEmployees() {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        'SELECT * FROM users WHERE user_type IN ("employee", "admin")'
      );
      return rows;
    } finally {
      connection.release();
    }
  }

  async updateEmployee(userData, id) {
    const connection = await pool.getConnection();
    try {
      const [result] = await connection.query(
        "UPDATE users SET ? WHERE id = ?",
        [userData, id]
      );
      
      if (result.affectedRows === 0) {
        throw new Error("Employee not found");
      }
      
      return "Account changes saved successfully";
    } finally {
      connection.release();
    }
  }
}

module.exports = UserRepository;