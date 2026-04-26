import express from 'express';
import { handleVapiWebhook } from '../controllers/vapi.controller.js';

const router = express.Router();

router.post('/webhook', handleVapiWebhook);

export default router;
