
const pool = require("../config/database.js");

const controller = class CartController {
  async getContent(user) {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        "SELECT content FROM `cart` WHERE `user_id` = ?",
        [user]
      );
      
      if (rows.length === 0) {
        return null;
      }
      
      return rows[0];
    } finally {
      connection.release();
    }
  }

  async addToCart(newProducts, user) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      const cartContent = await this.getContentInTx(connection, user);
      
      if (!cartContent) {
        // User chưa có giỏ hàng → Tạo mới
        await connection.query(
          "INSERT INTO `cart` SET ?",
          [{ user_id: user, content: JSON.stringify(newProducts) }]
        );
      } else {
        // User đã có giỏ hàng → Merge sản phẩm
        let cartProducts = cartContent.content;
        
        for (let cartProduct of cartProducts) {
          for (let newProduct of newProducts) {
            if (
              cartProduct.id == newProduct.id &&
              cartProduct.size == newProduct.size
            ) {
              cartProduct.quantity += newProduct.quantity;
              let index = newProducts.indexOf(newProduct);
              newProducts.splice(index, 1);
            }
          }
        }
        
        let updatedCartProducts = cartProducts.concat(newProducts);
        
        await connection.query(
          "UPDATE `cart` SET `content` = ? WHERE `user_id` = ?",
          [JSON.stringify(updatedCartProducts), user]
        );
      }
      
      await connection.commit();
      return "Added to the cart!";
    } catch (error) {
      await connection.rollback();
      console.error("Unexpected error in addToCart:", error);
      throw new Error("Could not add to cart");
    } finally {
      connection.release();
    }
  }

  async getContentInTx(connection, user) {
    const [rows] = await connection.query(
      "SELECT content FROM `cart` WHERE `user_id` = ?",
      [user]
    );
    
    if (rows.length === 0) {
      return null;
    }
    
    return rows[0];
  }

  async update(updateProduct, user) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      const cartContent = await this.getContentInTx(connection, user);
      let cartProducts = cartContent.content;
      let found = false;
      
      for (let cartProduct of cartProducts) {
        if (
          cartProduct.id == updateProduct.id &&
          cartProduct.size == updateProduct.size
        ) {
          found = true;
          if (updateProduct.quantity > 0) {
            cartProduct.quantity = updateProduct.quantity;
          } else {
            let index = cartProducts.indexOf(cartProduct);
            cartProducts.splice(index, 1);
          }
        }
      }
      
      if (!found) {
        cartProducts.push(updateProduct);
      }
      
      await connection.query(
        "UPDATE `cart` SET `content` = ? WHERE `user_id` = ?",
        [JSON.stringify(cartProducts), user]
      );
      
      await connection.commit();
      return "Cart updated!";
    } catch (err) {
      await connection.rollback();
      console.error("Error updating cart:", err);
      throw new Error("Could not access cart");
    } finally {
      connection.release();
    }
  }

  async empty(user) {
    const connection = await pool.getConnection();
    try {
      await connection.query(
        "DELETE FROM `cart` WHERE `user_id` = ?",
        [user]
      );
      return "Cart emptied";
    } finally {
      connection.release();
    }
  }
};

module.exports = controller;