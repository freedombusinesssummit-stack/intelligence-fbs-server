import express from 'express';
import { handleTallyWebhook } from '../controllers/tally.controller.js';

const router = express.Router();

router.post('/', handleTallyWebhook);

export default router;
