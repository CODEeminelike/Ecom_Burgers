module.exports = {
  testEnvironment: "node",
  collectCoverageFrom: [
    "src/services/**/*.js",
    "!src/services/**/*.test.js",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  testMatch: ["**/__tests__/**/*.test.js"],
  verbose: true,
};
