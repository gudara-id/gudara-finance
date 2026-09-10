const express = require("express");
const controller = require("../controllers/journalController");
const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");

const router = express.Router();
const canManageJournal = authorize("admin", "akuntan");

router.use(authenticate);

router.post("/", canManageJournal, controller.store);
router.get("/:id", canManageJournal, controller.show);
router.put("/:id", canManageJournal, controller.update);

module.exports = router;
