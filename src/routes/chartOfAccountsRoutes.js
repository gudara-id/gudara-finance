const express = require("express");
const controller = require("../controllers/chartOfAccountsController");
const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");

const router = express.Router();
const canManageAccounting = authorize("admin", "akuntan");

router.use(authenticate);

router.get("/", authorize("admin", "akuntan"), controller.index);
router.post("/", canManageAccounting, controller.store);
router.get("/:id", authorize("admin", "akuntan"), controller.show);
router.put("/:id", canManageAccounting, controller.update);
router.patch("/:id", canManageAccounting, controller.update);
router.delete("/:id", canManageAccounting, controller.destroy);

module.exports = router;
