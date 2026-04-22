import * as leadService from '../services/lead.service.js';

export const getLeads = async (req, res) => {
	try {
		const leads = await leadService.getLeads();
		res.json(leads);
	} catch (e) {
		res.status(500).json({ error: e.message });
	}
};
