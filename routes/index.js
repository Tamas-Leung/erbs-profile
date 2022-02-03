const { Router } = require("express");
const profile = require("./profile");

const router = Router();

// router.use("/monsters", monsters);
// router.use("/lives", lives);
router.use("/profile", profile);

module.exports = router;
