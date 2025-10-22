// express initialization
const express = require("express");
const router = express.Router();

// config and controller
require("dotenv").config();
const config = require("../config/app-config.js");
const UsersController = require("../controllers/users.js");
const User = new UsersController();

// required libraries
const bcrypt = require("bcrypt");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const sessionStore = new MySQLStore(config.sqlCon);
const bodyParser = require("body-parser");
const flash = require("express-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const cookieParser = require("cookie-parser");
const csurf = require("csurf");

// global middleware
router.use(
  session({
    name: process.env.SESSION_NAME,
    key: process.env.SESSION_KEY,
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true, // ✅ THÊM: chỉ gửi qua HTTPS
      httpOnly: true, // ✅ THÊM: chống XSS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

router.use(passport.initialize());
router.use(passport.session());

router.use(async function (req, res, next) {
  res.locals.isAuthenticated = req.isAuthenticated();

  if (req.isAuthenticated()) {
    try {
      const userType = await User.isAdmin(req.session.passport.user);
      res.locals.isAdmin = userType === "admin"; // ✅ Boolean rõ ràng
    } catch {
      res.locals.isAdmin = false;
    }
  } else {
    res.locals.isAdmin = false;
  }

  next();
});

router.use(bodyParser.json()); // support json encoded bodies
router.use(bodyParser.urlencoded({ extended: false })); // support encoded bodies
router.use(cookieParser());
router.use(csurf({ cookie: true }));
router.use(flash());

// In-memory storage for login attempts (không cần database)
const loginAttempts = {};

// Helper function to clean up old locked accounts
function cleanupLockedAccounts() {
    const now = Date.now();
    for (let email in loginAttempts) {
        if (loginAttempts[email].lockedUntil && loginAttempts[email].lockedUntil < now) {
            delete loginAttempts[email];
        }
    }
}

// passport configurations
passport.use('local', new LocalStrategy(async function (email, password, done) {
    let user;
    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCK_DURATION_MINUTES = 15;

    // Clean up old locked accounts
    cleanupLockedAccounts();

    // Check if account is locked
    if (loginAttempts[email]) {
        const now = Date.now();
        if (loginAttempts[email].lockedUntil && loginAttempts[email].lockedUntil > now) {
            const minutesLeft = Math.ceil((loginAttempts[email].lockedUntil - now) / 60000);
            return done(null, false, { 
                message: `Account is locked. Please try again in ${minutesLeft} minute(s)` 
            });
        }
    }

    try {
        user = await User.getUserByEmail(email);
    } catch (e) {
        return done(null, false, { message: 'No user with that email' })
    }

    try {
        if (await bcrypt.compare(password, user.password)) {
            // Successful login - reset attempts
            delete loginAttempts[email];
            return done(null, user)
        } else {
            // Failed login - increment attempts
            if (!loginAttempts[email]) {
                loginAttempts[email] = { attempts: 0, lockedUntil: null };
            }
            
            loginAttempts[email].attempts += 1;
            const currentAttempts = loginAttempts[email].attempts;
            
            // Check if we need to lock the account
            if (currentAttempts >= MAX_LOGIN_ATTEMPTS) {
                loginAttempts[email].lockedUntil = Date.now() + (LOCK_DURATION_MINUTES * 60 * 1000);
                return done(null, false, { 
                    message: `Too many failed login attempts. Account locked for ${LOCK_DURATION_MINUTES} minutes` 
                });
            }
            
            const attemptsLeft = MAX_LOGIN_ATTEMPTS - currentAttempts;
            return done(null, false, { 
                message: `Password incorrect. ${attemptsLeft} attempt(s) remaining` 
            });
        }
    } catch (e) {
        return done(e)
    }
}));

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(async function (id, done) {
  try {
    let user = await User.getUserById(id); // ✅ SỬA: thêm await
    done(null, user);
  } catch (e) {
    done(e); // ✅ SỬA: dùng done(e) thay vì throw e
  }
});

// Middleware để gửi tokens qua cookie
const sendTokens = async (req, res, next) => {
  try {
    const accessToken = User.generateAccessToken(req.user);
    const refreshToken = User.generateRefreshToken(req.user);

    // Lưu refresh token vào database
    await User.saveRefreshToken(req.user.id, refreshToken);

    // Gửi tokens qua cookie
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: true, // ✅ SỬA: luôn dùng secure (HTTPS)
      maxAge: 15 * 60 * 1000, // 15 phút
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true, // ✅ SỬA: luôn dùng secure (HTTPS)
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
    });

    next();
  } catch (error) {
    next(error);
  }
};

// login page
router.get("/", notAuthenticated(), (req, res) => {
  res.render(`${config.views}/public/login.ejs`, {
    csrfToken: req.csrfToken(),
  });
});

router.post(
  "/",
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  sendTokens,
  (req, res) => {
    res.redirect("/hamburguers");
  }
);

// logout
router.get("/logout", async (req, res) => {
  // Xóa refresh token từ database
  try {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      await User.deleteRefreshToken(refreshToken);
    }
  } catch (error) {
    console.error("Error deleting refresh token:", error);
  }

  // Xóa cookies
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");

  req.logout();
  req.session.destroy();
  res.redirect("/login");
});

// registration page
router.get("/register", (req, res) => {
  res.render(`${config.views}/public/register.ejs`, {
    csrfToken: req.csrfToken(),
  });
});

router.post("/register", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    let user = {
      name: req.body.name,
      email: req.body.username,
      password: hashedPassword,
      user_type: "customer",
    };

    const userId = await User.save(user);

    // Lấy user vừa tạo để tạo tokens
    const newUser = await User.getUserById(userId);

    // Tạo và gửi tokens
    const accessToken = User.generateAccessToken(newUser);
    const refreshToken = User.generateRefreshToken(newUser);

    await User.saveRefreshToken(newUser.id, refreshToken);

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: true, // ✅ SỬA: luôn dùng secure (HTTPS)
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true, // ✅ SỬA: luôn dùng secure (HTTPS)
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Đăng nhập user sau khi đăng ký
    req.login(newUser, (err) => {
      if (err) {
        return res.redirect("/login");
      }
      return res.redirect("/hamburguers");
    });
  } catch {
    res.redirect("/register");
  }
});

// Refresh token endpoint
router.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res
      .status(401)
      .json({ message: "Refresh token required" });
  }

  try {
    // Lấy user từ refresh token
    const user = await User.getUserByRefreshToken(refreshToken);

    // Tạo access token mới
    const newAccessToken = User.generateAccessToken(user);

    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: true, // ✅ SỬA: luôn dùng secure (HTTPS)
      maxAge: 15 * 60 * 1000,
    });

    res.json({ success: true });
  } catch (error) {
    res.status(403).json({ message: "Invalid refresh token" });
  }
});

// Profile page
router.get("/profile", async (req, res) => {
  const UsersController = require("../controllers/users.js");
  const User = new UsersController();
  let user;
  let msg = req.query.success;

  try {
    user = await User.getUserById(req.session.passport.user);
  } catch (e) {
    throw e;
  }

  res.render(`${config.views}/public/profile.ejs`, {
    user: user,
    msg: msg,
    csrfToken: req.csrfToken(),
  });
});

// Profile update
router.post("/profile", async (req, res) => {
  const UsersController = require("../controllers/users.js");
  const User = new UsersController();
  const userId = req.session.passport.user;

  try {
    await User.update(req.body.name, req.body.email, userId);
    if (req.body.password != "") {
      hashedPassword = await bcrypt.hash(req.body.password, 10);
      User.updatePassword(hashedPassword, userId);
    }
    res.redirect("/login/profile?success=true");
  } catch (e) {
    res.redirect("/login/profile?success=false");
  }
});

// Reset Password Form
router.get("/reset", async (req, res) => {
  let msg = req.query.success;
  res.render(`${config.views}/public/reset.ejs`, {
    msg: msg,
    csrfToken: req.csrfToken(),
  });
});

// Reset Password
router.post("/reset", async (req, res) => {
  const UsersController = require("../controllers/users.js");
  const User = new UsersController();

  try {
    const user = await User.getUserByEmail(req.body.email);

    const nodemailer = require("nodemailer");

    const randomPass = Math.random().toString(36).slice(-8);
    hashedPassword = await bcrypt.hash(randomPass, 10);
    User.updatePassword(hashedPassword, user.id);

    let transport = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    const message = {
      from: "service@burgersco.com",
      to: user.email,
      subject: "Password Reset - Burges Co.",
      text: `Hey ${user.name}, your password was resetted at Burgers Co.\nYour new password is: ${randomPass}`,
    };

    transport.sendMail(message);

    res.redirect("/login/reset?success=true");
  } catch {
    res.redirect("/login/reset?success=false");
  }
});

// auth verify middleware
function notAuthenticated() {
  return (req, res, next) => {
    if (!req.isAuthenticated()) return next();
    res.redirect("/hamburguers");
  };
}

module.exports = router;
