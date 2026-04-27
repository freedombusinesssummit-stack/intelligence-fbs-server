import * as leadService from '../services/lead.service.js';
import axios from 'axios';

const BASEROW_TOKEN = 'FdZLWlngmzIFcoORXGkWxroylbibm8C9';
const TABLE_ID = 899262;

const getLeadStatus = callStatus => {
	switch (callStatus) {
		case 'completed':
			return 'Hot';
		case 'in-progress':
			return 'Warm';
		case 'no_answer':
		case 'failed':
			return 'Cold';
		default:
			return 'Cold';
	}
};

const mapCallStatus = status => {
	switch (status) {
		case 'queued':
		case 'ringing':
		case 'in-progress':
			return 'pending';

		case 'completed':
			return 'completed';

		case 'no-answer':
			return 'no_answer';

		case 'failed':
		case 'busy':
		case 'canceled':
			return 'failed';

		default:
			return 'pending';
	}
};

const normalizePhone = phone => {
	if (!phone) return '';
	return phone.replace(/\s+/g, '').replace(/[^+\d]/g, '');
};

const sendToVapi = async lead => {
	try {
		const phone = normalizePhone(lead['Phone number']);

		if (!phone) {
			console.log('⚠️ VAPI SKIP: no phone');
			return null;
		}

		console.log('📞 Sending to VAPI:', phone);

		const response = await axios.post(
			'https://api.vapi.ai/call',
			{
				assistantId: process.env.VAPI_ASSISTANT_ID,
				phoneNumberId: process.env.VAPI_PHONE_ID,
				customer: {
					number: phone,
					name: lead.Name || '',
				},
				metadata: {
					name: lead.Name || '',
					phone,
					nationality: lead['What is your nationality'] || '',
					program:
						lead[
							'What residency or citizenship program is appealing to you the most?'
						] || '',
					timeline:
						lead['Are you actively considering relocating within 12 months?'] ||
						'',
					capital: lead['What is your annual capital'] || '',
				},
			},
			{
				headers: {
					Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
					'Content-Type': 'application/json',
				},
			},
		);

		console.log('✅ VAPI SUCCESS:', response.data);
		return response.data;
	} catch (error) {
		console.error('❌ VAPI ERROR:', error.response?.data || error.message);
		return null;
	}
};

export const getLeads = async (req, res) => {
	try {
		const leads = await leadService.getLeads();
		res.json(leads);
	} catch (e) {
		res.status(500).json({ error: e.message });
	}
};

export const createLead = async (req, res) => {
	try {
		const {
			name,
			phone,
			company,
			nationality,
			jurisdiction,
			timeline,
			capital,
		} = req.body;

		const lead = {
			Name: name,
			'Phone number': phone,
			Company: company || '',
			'What is your nationality': nationality,
			'What residency or citizenship program is appealing to you the most?':
				jurisdiction,
			'Are you actively considering relocating within 12 months?': timeline,
			'What is your annual capital': capital,
			'Lead Status': 'Cold',
		};

		const baserowResponse = await axios.post(
			`https://api.baserow.io/api/database/rows/table/${TABLE_ID}/?user_field_names=true`,
			lead,
			{
				headers: {
					Authorization: `Token ${BASEROW_TOKEN}`,
					'Content-Type': 'application/json',
				},
			},
		);

		const rowId = baserowResponse.data.id;

		res.status(201).json({
			message: 'Lead created',
			data: baserowResponse.data,
		});

		sendToVapi(lead)
			.then(async callData => {
				if (!callData?.id) {
					console.log('⚠️ No callId returned from VAPI');
					return;
				}

				const callId = callData.id;
				const callStatus = callData.status || 'queued';

				await axios.patch(
					`https://api.baserow.io/api/database/rows/table/${TABLE_ID}/${rowId}/?user_field_names=true`,
					{
						'Vapi Call ID': callId,
						'Call Status': mapCallStatus(callStatus),
						'Lead Status': getLeadStatus(callStatus),
					},
					{
						headers: {
							Authorization: `Token ${BASEROW_TOKEN}`,
							'Content-Type': 'application/json',
						},
					},
				);

				console.log('✅ BASEROW UPDATED WITH VAPI CALL ID');
			})
			.catch(err => {
				console.error('🔥 VAPI BACKGROUND ERROR:', err.message);
			});
	} catch (error) {
		console.error(
			'❌ POST lead error:',
			JSON.stringify(error.response?.data || error.message, null, 2),
		);

		res.status(500).json({
			error:
				error.response?.data?.detail ||
				error.response?.data?.error ||
				error.message,
		});
	}
};
