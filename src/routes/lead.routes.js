import express from 'express';
import { getLeads, createLead } from '../controllers/lead.controller.js';

const router = express.Router();

router.get('/', getLeads);
router.post('/', createLead);

export default router;
