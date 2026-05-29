import express from 'express';
import { vapiWebhook } from '../controllers/vapi.controller.js';

const router = express.Router();

router.post('/webhook', vapiWebhook);

export default router;
