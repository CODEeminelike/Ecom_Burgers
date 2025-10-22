//  src/middleware/security.middleware.js
//  Middleware bảo mật bổ sung

/**
 * Validate và sanitize product ID
 */
const validateProductId = (req, res, next) => {
  const productId = req.query.p || req.params.id || req.body.id;
  
  if (!productId) {
    return res.status(400).json({
      error: "Product ID is required"
    });
  }
  
  const parsed = parseInt(productId);
  if (isNaN(parsed) || parsed <= 0) {
    return res.status(400).json({
      error: "Invalid product ID"
    });
  }
  
  // Attach validated ID to request
  req.validatedProductId = parsed;
  next();
};

/**
 * Rate limiting cho sensitive operations
 */
const rateLimit = require("express-rate-limit");

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit to 5 checkout attempts per 15 minutes
  message: "Too many checkout attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const cartUpdateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 updates per minute
  message: "Too many cart updates. Please slow down.",
});

/**
 * Verify cart ownership
 */
const verifyCartOwnership = async (req, res, next) => {
  try {
    const CartController = require("../controllers/cart.js");
    const Cart = new CartController();
    
    const userId = req.session.passport?.user || req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        error: "Authentication required"
      });
    }
    
    const cartContent = await Cart.getContent(userId);
    
    if (!cartContent) {
      return res.status(404).json({
        error: "Cart not found"
      });
    }
    
    // Attach to request for use in route handler
    req.userCart = cartContent;
    req.userId = userId;
    next();
    
  } catch (error) {
    console.error("Cart ownership verification failed:", error);
    res.status(500).json({
      error: "Failed to verify cart ownership"
    });
  }
};

/**
 * Validate cart content integrity
 */
const validateCartIntegrity = async (req, res, next) => {
  try {
    if (!req.userCart || !req.userCart.content) {
      return next();
    }
    
    const ProductsController = require("../controllers/products.js");
    const Products = new ProductsController();
    
    // Check each item in cart
    for (let item of req.userCart.content) {
      // Validate item structure
      if (!item.id || !item.size || !item.quantity) {
        throw new Error("Invalid cart item structure");
      }
      
      // Validate quantity
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error("Invalid item quantity");
      }
      
      // Verify product exists
      const product = await Products.getProduct(item.id);
      const sizeData = product.find(p => p.size === item.size);
      
      if (!sizeData) {
        throw new Error(`Product ${item.id} size ${item.size} no longer available`);
      }
      
      // Verify stock
      if (sizeData.stock < item.quantity) {
        throw new Error(`Insufficient stock for product ${item.id}`);
      }
    }
    
    next();
    
  } catch (error) {
    console.error("Cart integrity check failed:", error);
    
    // Clear corrupted cart
    if (req.userId) {
      const CartController = require("../controllers/cart.js");
      const Cart = new CartController();
      await Cart.empty(req.userId);
    }
    
    res.status(400).json({
      error: error.message,
      action: "cart_cleared"
    });
  }
};

/**
 * Input sanitization helper
 */
const sanitizeInput = (input, maxLength = 255) => {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    .trim()
    .substring(0, maxLength)
    .replace(/[<>]/g, ''); // Basic XSS prevention
};

/**
 * Validate price integrity (prevent price manipulation)
 */
const validatePriceIntegrity = async (req, res, next) => {
  try {
    if (!req.userCart || !req.userCart.content) {
      return next();
    }
    
    const ProductsController = require("../controllers/products.js");
    const Products = new ProductsController();
    
    let totalPrice = 0;
    
    for (let item of req.userCart.content) {
      const product = await Products.getProduct(item.id);
      const sizeData = product.find(p => p.size === item.size);
      
      // Calculate expected price
      const expectedPrice = sizeData.price * item.quantity;
      totalPrice += expectedPrice;
      
      // If cart stores price, verify it matches
      if (item.price && Math.abs(item.price - sizeData.price) > 0.01) {
        throw new Error("Price mismatch detected");
      }
    }
    
    req.calculatedTotal = totalPrice;
    next();
    
  } catch (error) {
    console.error("Price validation failed:", error);
    res.status(400).json({
      error: "Price validation failed. Please refresh your cart."
    });
  }
};

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  next();
};

/**
 * Log suspicious activity
 */
const logSuspiciousActivity = (userId, action, details) => {
  console.warn(`[SECURITY] Suspicious activity detected:
    User: ${userId}
    Action: ${action}
    Details: ${JSON.stringify(details)}
    Timestamp: ${new Date().toISOString()}
  `);
  
  // TODO: Send to security monitoring system
  // TODO: Implement rate limiting per user
  // TODO: Consider temporary account lock after threshold
};

module.exports = {
  validateProductId,
  checkoutLimiter,
  cartUpdateLimiter,
  verifyCartOwnership,
  validateCartIntegrity,
  sanitizeInput,
  validatePriceIntegrity,
  securityHeaders,
  logSuspiciousActivity
};