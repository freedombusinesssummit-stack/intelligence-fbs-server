import axios from 'axios';

const BASEROW_TOKEN = 'FdZLWlngmzIFcoORXGkWxroylbibm8C9';
const TABLE_ID = 899262;

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
		default:
			return 'failed';
	}
};

const getLeadStatus = callStatus => {
	switch (callStatus) {
		case 'completed':
			return 'Hot';
		case 'in-progress':
			return 'Warm';
		default:
			return 'Cold';
	}
};

export const vapiWebhook = async (req, res) => {
	try {
		console.log('📩 VAPI WEBHOOK:', JSON.stringify(req.body, null, 2));

		const call = req.body;

		const callId = call.id;
		const status = call.status;

		console.log('📞 CALL STATUS:', status);

		// 🔎 ищем лид по callId
		const findRes = await axios.get(
			`https://api.baserow.io/api/database/rows/table/${TABLE_ID}/?user_field_names=true&filter__field_Vapi Call ID__equal=${callId}`,
			{
				headers: {
					Authorization: `Token ${BASEROW_TOKEN}`,
				},
			},
		);

		const row = findRes.data.results[0];

		if (!row) {
			console.log('❌ Lead not found by callId');
			return res.sendStatus(200);
		}

		const mappedStatus = mapCallStatus(status);
		const leadStatus = getLeadStatus(status);

		// ✏️ обновляем лид
		await axios.patch(
			`https://api.baserow.io/api/database/rows/table/${TABLE_ID}/${row.id}/?user_field_names=true`,
			{
				'Call Status': mappedStatus,
				'Lead Status': leadStatus,
			},
			{
				headers: {
					Authorization: `Token ${BASEROW_TOKEN}`,
					'Content-Type': 'application/json',
				},
			},
		);

		console.log('✅ CALL UPDATED IN BASEROW');

		// 🔥 лог результата разговора
		console.log('🧠 SUMMARY:', call.analysis?.summary);
		console.log('🗣 TRANSCRIPT:', call.transcript);

		res.sendStatus(200);
	} catch (err) {
		console.error('❌ WEBHOOK ERROR:', err.message);
		res.sendStatus(500);
	}
};
