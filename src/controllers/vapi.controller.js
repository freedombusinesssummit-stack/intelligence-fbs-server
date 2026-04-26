import axios from 'axios';

const BASEROW_TOKEN = process.env.BASEROW_TOKEN;
const TABLE_ID = process.env.BASEROW_TABLE_ID;

const getLeadStatus = callStatus => {
	switch (callStatus) {
		case 'completed':
		case 'ended':
			return 'Hot';
		case 'no_answer':
			return 'Cold';
		case 'failed':
		case 'busy':
		case 'canceled':
			return 'Lost';
		default:
			return 'New';
	}
};

export const handleVapiWebhook = async (req, res) => {
	try {
		console.log('🔥 VAPI WEBHOOK:', JSON.stringify(req.body, null, 2));

		const call = req.body?.message?.call || req.body?.call || req.body;
		const callId = call?.id;
		const status = call?.status || req.body?.message?.status || '';

		if (!callId) {
			return res.status(400).json({ error: 'No call id' });
		}

		const searchResponse = await axios.get(
			`https://api.baserow.io/api/database/rows/table/${TABLE_ID}/?user_field_names=true&search=${callId}`,
			{
				headers: {
					Authorization: `Token ${BASEROW_TOKEN}`,
				},
			},
		);

		const row = searchResponse.data.results?.find(
			item => item['Vapi Call ID'] === callId,
		);

		if (!row) {
			console.log('⚠️ Baserow row not found for call:', callId);
			return res.status(200).json({ success: false });
		}

		await axios.patch(
			`https://api.baserow.io/api/database/rows/table/${TABLE_ID}/${row.id}/?user_field_names=true`,
			{
				'Call Status': status,
				'Lead Status': getLeadStatus(status),
				'Call Outcome': req.body?.message?.endedReason || '',
				'Call Duration': call?.duration || '',
				'Call Date': new Date().toISOString(),
			},
			{
				headers: {
					Authorization: `Token ${BASEROW_TOKEN}`,
					'Content-Type': 'application/json',
				},
			},
		);

		res.status(200).json({ success: true });
	} catch (error) {
		console.error(
			'❌ VAPI WEBHOOK ERROR:',
			error.response?.data || error.message,
		);
		res.status(500).json({ error: 'VAPI webhook error' });
	}
};
