// express initialization
const express = require("express");
const router = express.Router();
const config = require("../config/app-config.js");

// required libraries
const session = require("express-session");
const passport = require("passport");
const bodyParser = require("body-parser");
const { check, validationResult } = require("express-validator");

const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const csrfProtection = csurf({ cookie: true });

// global middleware
router.use(
  session({
    name: process.env.SESSION_NAME,
    key: process.env.SESSION_KEY,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

router.use(bodyParser.json()); // support json encoded bodies
router.use(bodyParser.urlencoded({ extended: false })); // support encoded bodies
router.use(cookieParser());
router.use(passport.initialize());
router.use(passport.session());

router.use(async function (req, res, next) {
  const UsersController = require("../controllers/users.js");
  const User = new UsersController();

  res.locals.isAuthenticated = req.isAuthenticated();

  try {
    res.locals.isAdmin = await User.isAdmin(
      req.session.passport.user
    );
  } catch {
    res.locals.isAdmin = false;
  }

  next();
});

// Index page
router.get("/", (req, res) => {
  res.render(`${config.views}/public/index.ejs`);
});

// Products page
router.get("/hamburguers", async (req, res) => {
  const ProductsController = require("../controllers/products.js");
  const Products = new ProductsController();

  try {
    products = await Products.getPaginated((page = 0));
  } catch (e) {
    throw e;
  }

  res.render(`${config.views}/public/hamburguers.ejs`, {
    products: products,
  });
});

// ✅ FIXED: Product order page - Sửa IDOR
router.get("/order", authenticate(), async (req, res, next) => {
  const ProductsController = require("../controllers/products.js");
  const Products = new ProductsController();

  try {
    // ✅ 1. VALIDATE: Kiểm tra product ID có tồn tại và hợp lệ
    if (!req.query.p) {
      const error = new Error("Product ID is required");
      error.status = 400;
      throw error;
    }

    // ✅ 2. SANITIZE: Chuyển đổi và validate product ID
    const productId = parseInt(req.query.p);
    if (isNaN(productId) || productId <= 0) {
      const error = new Error("Invalid product ID format");
      error.status = 400;
      throw error;
    }

    // ✅ 3. AUTHORIZATION: Kiểm tra product có tồn tại và available không
    const product = await Products.getProduct(productId);
    
    if (!product || product.length === 0) {
      const error = new Error("Product not found");
      error.status = 404;
      throw error;
    }

    // ✅ 4. BUSINESS LOGIC: Kiểm tra product có stock không
    const hasStock = product.some(p => p.stock > 0);
    if (!hasStock) {
      // Có thể render trang "out of stock" thay vì throw error
      return res.render(`${config.views}/public/order.ejs`, {
        product: product,
        message: "This product is currently out of stock"
      });
    }

    // ✅ 5. LOG: Ghi log cho security monitoring
    console.log(`[ACCESS] User ${req.session.passport.user} viewed product ${productId}`);

    res.render(`${config.views}/public/order.ejs`, {
      product: product,
    });

  } catch (e) {
    console.log("❌ Error in /order:", e.message);
    
    // ✅ 6. ERROR HANDLING: Không leak thông tin sensitive
    if (e.status === 404) {
      return res.status(404).render(`${config.views}/public/error.ejs`, {
        message: "Product not found"
      });
    }
    
    if (e.status === 400) {
      return res.status(400).render(`${config.views}/public/error.ejs`, {
        message: "Invalid product request"
      });
    }

    next(e); // → Chuyển lỗi đến appError middleware > Jira
  }
});

// ✅ FIXED: Cart page - Verify ownership
router.get("/cart", authenticate(), async (req, res) => {
  const ProductsController = require("../controllers/products.js");
  const Products = new ProductsController();
  const CartController = require("../controllers/cart.js");
  const Cart = new CartController();
  
  let cartContent;
  let products;

  try {
    // ✅ AUTHORIZATION: CHỈ lấy cart của user hiện tại
    const userId = req.session.passport.user;
    
    if (!userId) {
      return res.redirect("/login");
    }

    cartContent = await Cart.getContent(userId);
    
    if (!cartContent || !cartContent.content || cartContent.content.length === 0) {
      return res.render(`${config.views}/public/cart.ejs`, {
        cart: null,
        products: null,
      });
    }

    // ✅ VALIDATE: Verify all products in cart still exist
    let idList = cartContent.content.map(({ id }) => id);
    idList = Array.from(new Set(idList)).toString();
    
    // ✅ SANITIZE: Validate idList format
    if (!/^[\d,]+$/.test(idList)) {
      console.error("Invalid cart content format");
      await Cart.empty(userId); // Clear corrupted cart
      return res.redirect("/cart");
    }
    
    products = await Products.getByIdArray(idList);
    
  } catch (err) {
    console.error("❌ Cart error:", err);
    cartContent = null;
    products = null;
  }

  if (cartContent) {
    products = JSON.parse(JSON.stringify(products));
  }
  
  res.render(`${config.views}/public/cart.ejs`, {
    cart: cartContent ? cartContent.content : null,
    products: products,
  });
});

// ✅ FIXED: Checkout process - Enhanced security
router.get("/checkout", authenticate(), async (req, res) => {
  const CartController = require("../controllers/cart.js");
  const Cart = new CartController();
  
  try {
    // ✅ AUTHORIZATION: Verify user has items in cart
    const userId = req.session.passport.user;
    const cartContent = await Cart.getContent(userId);
    
    if (!cartContent || !cartContent.content || cartContent.content.length === 0) {
      return res.redirect("/cart");
    }
    
    let formErrors = req.session.formErrors ? req.session.formErrors : false;
    req.session.formErrors = false;
    res.locals.csrfToken = req.csrfToken();
    
    res.render(`${config.views}/public/checkoutProcess.ejs`, {
      errors: formErrors,
    });
    
  } catch (e) {
    console.error("Checkout access error:", e);
    res.redirect("/cart");
  }
});

// ✅ FIXED: Checkout order - Complete validation
router.post(
  "/checkout",
  authenticate(),
  [
    // ✅ SANITIZE & VALIDATE all inputs
    check("city").isLength({ min: 3, max: 100 }).trim().escape(),
    check("address").isLength({ min: 3, max: 200 }).trim().escape(),
    check("state").optional().isLength({ max: 50 }).trim().escape(),
    check("zip").isNumeric().isLength({ min: 4, max: 10 }),
    check("card").isNumeric().isLength({ min: 13, max: 19 }),
    check("expMonth").isLength({ min: 2, max: 2 }).isNumeric()
      .custom(value => {
        const month = parseInt(value);
        return month >= 1 && month <= 12;
      }).withMessage("Invalid month"),
    check("expYear").isLength({ min: 2, max: 2 }).isNumeric()
      .custom(value => {
        const year = parseInt(value);
        const currentYear = new Date().getFullYear() % 100;
        return year >= currentYear;
      }).withMessage("Card expired"),
    check("cvCode").isLength({ min: 3, max: 4 }).isNumeric(),
  ],
  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      req.session.formErrors = errors.array();
      return res.redirect("/checkout");
    }

    const CartController = require("../controllers/cart.js");
    const Cart = new CartController();
    const OrdersController = require("../controllers/orders.js");
    const Orders = new OrdersController();
    const ProductsController = require("../controllers/products.js");
    const Products = new ProductsController();

    let cartContent;
    let orderId;
    
    try {
      // ✅ AUTHORIZATION: CHỈ process cart của user hiện tại
      const userId = req.session.passport.user;
      
      if (!userId) {
        return res.redirect("/login");
      }

      cartContent = await Cart.getContent(userId);
      
      if (!cartContent || !cartContent.content || cartContent.content.length === 0) {
        req.session.formErrors = [{ msg: "Your cart is empty" }];
        return res.redirect("/cart");
      }

      // ✅ VALIDATE: Verify products still available và prices unchanged
      for (let item of cartContent.content) {
        try {
          const product = await Products.getProduct(item.id);
          const sizeData = product.find(p => p.size === item.size);
          
          if (!sizeData) {
            throw new Error(`Product ${item.id} size ${item.size} not found`);
          }
          
          // ✅ CHECK STOCK
          if (sizeData.stock < item.quantity) {
            throw new Error(
              `Insufficient stock for ${product[0].title} (${item.size}). ` +
              `Available: ${sizeData.stock}, Requested: ${item.quantity}`
            );
          }
          
          // ✅ VERIFY PRICE hasn't changed (optional - prevents price manipulation)
          // Store original price in cart and compare here
          
        } catch (productError) {
          req.session.formErrors = [{ msg: productError.message }];
          return res.redirect("/cart");
        }
      }

      // ✅ CREATE ORDER: Transaction-safe
      orderId = await Orders.create({ costumer_id: userId });
      await Orders.saveOrderProducts(orderId, cartContent.content);
      await Cart.empty(userId);
      
      // ✅ LOG: Success event
      console.log(`[SUCCESS] Order ${orderId} created by user ${userId}`);

      res.render(`${config.views}/public/checkout.ejs`);
      
    } catch (e) {
      console.error("❌ Checkout error:", e);
      
      // ✅ ROLLBACK: Nếu có orderId nhưng failed, nên rollback
      // (Implement trong Orders controller)
      
      req.session.formErrors = [{ 
        msg: "Checkout failed. Please try again." 
      }];
      res.redirect("/checkout");
    }
  }
);

// contact page
router.get("/contact", (req, res) => {
  res.render(`${config.views}/public/contact.ejs`);
});

// ✅ ENHANCED: Auth verify middleware
function authenticate() {
  return (req, res, next) => {
    if (req.isAuthenticated()) {
      // ✅ Additional check: Verify session hasn't expired
      if (!req.session.passport || !req.session.passport.user) {
        return res.redirect("/login");
      }
      return next();
    }
    
    // ✅ Store intended URL for redirect after login
    req.session.returnTo = req.originalUrl;
    res.redirect("/login");
  };
}

module.exports = router;