import axios from 'axios';

const BASEROW_BASE = 'https://api.baserow.io/api/database/rows/table';

const baserowHeaders = {
	Authorization: `Token ${process.env.BASEROW_TOKEN}`,
	'Content-Type': 'application/json',
};

const findRowByCallId = async callId => {
	const url = `${BASEROW_BASE}/${process.env.BASEROW_TABLE_DEMO_ID}/?user_field_names=true&filter__Vapi Call ID__equal=${encodeURIComponent(callId)}`;

	console.log('🔍 Searching Baserow by callId:', callId);

	const res = await axios.get(url, {
		headers: {
			Authorization: `Token ${process.env.BASEROW_TOKEN}`,
			'Content-Type': 'application/json',
		},
	});

	console.log('📦 Baserow results count:', res.data.results?.length);

	const row = res.data.results?.find(r => r['Vapi Call ID'] === callId);
	return row ?? null;
};

const calcDuration = (messages = []) => {
	const totalMs = messages.reduce((sum, m) => sum + (m.duration || 0), 0);
	return Math.round(totalMs / 1000);
};

const getLeadStatus = durationSec => {
	if (durationSec > 30) return 'Hot';
	if (durationSec > 10) return 'Warm';
	return 'Cold';
};

const getCallStatus = endedReason => {
	if (endedReason === 'no-answer') return 'no_answer';
	return 'completed';
};

export const vapiWebhook = async (req, res) => {
	try {
		const body = req.body;
		const msg = body.message;
		console.log(process.env.BASEROW_TOKEN);
		// У Vapi фінальний ивент — type: "end-of-call-report", не status: "ended"
		const type = msg?.type;
		const endedReason = msg?.endedReason;

		// Всі дані call лежать всередині body.message.call
		const call = msg?.call;
		const callId = call?.id;
		const metadata = call?.metadata;
		const email = metadata?.email || '';

		console.log(
			'📩 TYPE:',
			type,
			'| REASON:',
			endedReason,
			'| CALL ID:',
			callId,
		);
		console.log('📋 METADATA:', JSON.stringify(metadata, null, 2));

		// Пропускаємо всі не фінальні події
		if (type !== 'end-of-call-report') {
			console.log('⏭ Skip non-final event:', type);
			return res.sendStatus(200);
		}

		// Шукаємо rowId — спочатку з metadata, потім по callId
		let rowId = metadata?.rowId ?? null;
		console.log('🔑 rowId from metadata:', rowId);

		if (!rowId) {
			if (!callId) {
				console.log('❌ No rowId and no callId — cannot proceed');
				return res.sendStatus(200);
			}

			const row = await findRowByCallId(callId);

			if (row) {
				rowId = row.id;
				console.log('✅ Found rowId via callId:', rowId);
			} else {
				console.log('❌ Row not found by callId:', callId);
				return res.sendStatus(200);
			}
		}

		const messages = msg?.artifact?.messages || [];
		const durationSec = msg?.durationSeconds
			? Math.round(msg.durationSeconds)
			: calcDuration(messages);

		const leadStatus = getLeadStatus(durationSec);
		const callStatus = getCallStatus(endedReason);

		const summary =
			msg?.analysis?.summary ||
			msg?.summary ||
			messages
				.map(m => m.message)
				.filter(Boolean)
				.join(' ') ||
			'No summary';

		console.log('📊 Stats:', { rowId, callStatus, leadStatus, durationSec });
		console.log('📝 Summary (first 200):', summary.substring(0, 200));

		await axios.patch(
			`${BASEROW_BASE}/${process.env.BASEROW_TABLE_DEMO_ID}/${rowId}/?user_field_names=true`,
			{
				'Call Status': callStatus,
				'Lead Status': leadStatus,
				'Call Duration': durationSec,
				'Call Date': new Date().toISOString(),
				'Call Outcome': summary.substring(0, 1000),
			},
			{
				headers: {
					Authorization: `Token ${process.env.BASEROW_TOKEN}`,
					'Content-Type': 'application/json',
				},
			},
		);

		console.log('✅ Baserow row updated successfully, rowId:', rowId);
		return res.sendStatus(200);
	} catch (err) {
		console.error('❌ WEBHOOK ERROR:', {
			message: err.message,
			status: err.response?.status,
			data: err.response?.data,
		});

		return res.sendStatus(500);
	}
};
