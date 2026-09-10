const express = require("express");
const controller = require("../controllers/reportsController");
const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");

const router = express.Router();
const canReadReports = authorize("admin", "akuntan", "manajemen");

router.use(authenticate);

router.get("/income-statement", canReadReports, controller.incomeStatement);
router.get("/income-statement/export", canReadReports, controller.exportIncomeStatement);
router.get("/balance-sheet", canReadReports, controller.balanceSheet);
router.get("/balance-sheet/export", canReadReports, controller.exportBalanceSheet);
router.get("/cash-flow", canReadReports, controller.cashFlow);
router.get("/cash-flow/export", canReadReports, controller.exportCashFlow);

module.exports = router;
