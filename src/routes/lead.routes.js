import express from 'express';
import {
	getLeads,
	createLead,
	updateLeadStatus,
	getLeadsDemo,
} from '../controllers/lead.controller.js';

const router = express.Router();

router.get('/', getLeads);
router.post('/', createLead);
router.get('/demo', getLeadsDemo);
router.patch('/:id/status', updateLeadStatus);

export default router;
