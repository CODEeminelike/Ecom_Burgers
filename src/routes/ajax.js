// ✅ FIXED: src/routes/ajax.js
const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");

// ✅ Thêm authentication middleware cho TẤT CẢ routes
router.use(authenticateToken);

// ✅ Validate ownership
router.post("/addToCart", async (req, res) => {
  const CartController = require("../controllers/cart.js");
  const Cart = new CartController();
  
  try {
    // ✅ Lấy userId từ authenticated token, KHÔNG từ request body
    const userId = req.user.id;
    
    // ✅ Validate product data
    if (!Array.isArray(req.body.addToCart)) {
      return res.status(400).json({ error: "Invalid cart data" });
    }
    
    // ✅ Verify products exist và prices match
    const ProductsController = require("../controllers/products.js");
    const Products = new ProductsController();
    
    for (let item of req.body.addToCart) {
      const product = await Products.getProduct(item.id);
      const sizeData = product.find(p => p.size === item.size);
      
      // ✅ Validate price hasn't been tampered
      if (!sizeData || sizeData.stock < item.quantity) {
        return res.status(400).json({ 
          error: "Invalid product or insufficient stock" 
        });
      }
    }
    
    const response = await Cart.addToCart(req.body.addToCart, userId);
    res.json({ success: true, message: response });
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ✅ Update cart with ownership verification
router.post("/updateCart", async (req, res) => {
  const CartController = require("../controllers/cart.js");
  const Cart = new CartController();
  
  try {
    const userId = req.user.id;
    
    // ✅ Verify cart belongs to user
    const currentCart = await Cart.getContent(userId);
    if (!currentCart) {
      return res.status(404).json({ error: "Cart not found" });
    }
    
    const response = await Cart.update(req.body.updateProduct, userId);
    res.json({ success: true, message: response });
    
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ✅ Check stock - rate limit để tránh abuse
const rateLimit = require("express-rate-limit");
const stockCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

router.get("/checkStock", stockCheckLimiter, async (req, res) => {
  const ProductsController = require("../controllers/products.js");
  const Products = new ProductsController();
  
  try {
    // ✅ Validate input
    if (!req.query.id || !req.query.size) {
      return res.status(400).json({ error: "Missing parameters" });
    }
    
    const stock = await Products.checkStock(req.query.id, req.query.size);
    res.json(stock);
    
  } catch (e) {
    res.status(500).json({ error: "Product not found" });
  }
});

module.exports = router;