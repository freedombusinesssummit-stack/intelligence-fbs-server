import axios from 'axios';

const getLeadStatus = callStatus => {
	switch (callStatus) {
		case 'completed':
			return 'Hot'; // 🔥
		case 'no_answer':
			return 'Cold';
		case 'failed':
			return 'Lost';
		default:
			return 'New';
	}
};

const sendToVapi = async lead => {
	try {
		if (!lead['Phone number']) {
			console.log('⚠️ VAPI SKIP: no phone');
			return null;
		}

		const phone = lead['Phone number']
			.replace(/\s+/g, '')
			.replace(/[^+\d]/g, '');

		console.log('📞 Sending to VAPI:', phone);

		const response = await axios.post(
			'https://api.vapi.ai/call',
			{
				assistantId: process.env.VAPI_ASSISTANT_ID,
				phoneNumberId: process.env.VAPI_PHONE_ID,
				customer: {
					number: phone,
					name: lead['Name'] || '',
					email: lead['Email'] || '',
				},
				metadata: {
					country: lead["Respondent's country"] || '',
					program:
						lead[
							'What residency or citizenship program is appealing to you the most'
						] || '',
					income: lead['What is your annual personal income?'] || '',
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

export const handleTallyWebhook = async (req, res) => {
	try {
		console.log('🔥 TALLY RAW:', JSON.stringify(req.body, null, 2));

		const fields = req.body?.data?.fields || [];

		// 🔥 універсальний маппер (ВСЕ парсить)
		const mapFields = fields => {
			const result = {};

			fields.forEach(f => {
				let key = f.label || f.type;

				// прибираємо null ключі
				if (!key) key = f.type;

				// 🧠 MULTIPLE_CHOICE → текст замість id
				if (f.type === 'MULTIPLE_CHOICE') {
					result[key] =
						f.options
							?.filter(opt => f.value?.includes(opt.id))
							.map(opt => opt.text)
							.join(', ') || '';
				}
				// 🧠 CHECKBOXES (boolean)
				else if (f.type === 'CHECKBOXES') {
					result[key] = Array.isArray(f.value)
						? f.options
								?.filter(opt => f.value.includes(opt.id))
								.map(opt => opt.text)
								.join(', ')
						: f.value;
				}
				// 🧠 все інше
				else {
					result[key] = f.value ?? '';
				}
			});

			return result;
		};

		const mapped = mapFields(fields);

		console.log('✅ MAPPED:', mapped);

		// 🔥 формуємо обʼєкт під Baserow
		// (тут ти задаєш структуру таблиці)
		const lead = {
			// базовые
			Name: mapped['Your full name '] || '',
			Email: mapped['What is you best email to get in touch ?'] || '',
			'Phone number': mapped['Your best whatsapp ?'] || '',

			// системные
			"Respondent's country": mapped['RESPONDENT_COUNTRY'] || '',

			// блок 1
			'Where are you located now 🌍 ?':
				mapped['Where are you located now 🌏 ?'] || '',
			'Are you a US Citizen ?': mapped['Are you a US Citizen ?'] || '',
			'What is your nationality 🌍 ?':
				mapped['What is your nationality 🌏 ?'] || '',

			// блок 2
			'Which best describes your situation?':
				mapped['Which best describes your situation?'] || '',
			'Do you currently live in the U.S. or abroad?':
				mapped['Do you currently live in the U.S. or abroad?'] || '',
			'Do you have another country residency or citizenship':
				mapped['Do you have another country residency or citizenship'] || '',
			'What countries ?': mapped['What countries ?'] || '',

			// блок 3
			'Are you actively considering relocating within 12 months?':
				mapped['Are you actively considering relocating within 12 months?'] ||
				'',
			'How many countries are you currently active in - either through clients, business setup, residency or real estate?':
				mapped[
					'How many countries are you currently active in - either through clients, business setup, residency or real estate?'
				] || '',

			// блок 4
			'What residency or citizenship program is appealing to you the most':
				mapped[
					'What residency or citizenship program is appealing to you the most'
				] || '',
			'What is your professional industry background ?':
				mapped['What is your professional industry background ?'] || '',
			'Your Position': mapped['Your Position'] || '',
			'Add your company website': mapped['Add your company website'] || '',
			'Share your LinkedIn profile (if any)':
				mapped['Share your LinkedIn profile (if any)'] || '',

			// блок 5
			'What is your annual personal income?':
				mapped['What is your annual personal income?'] || '',
			'Which direction best describes your current focus?':
				mapped['Which direction best describes your current focus?'] || '',
			'What best describes your current situation regarding the U.S.?':
				mapped[
					'What best describes your current situation regarding the U.S.?'
				] || '',
			'What best describes your current global strategy?':
				mapped['What best describes your current global strategy?'] || '',

			// блок 6
			'Your Global Mobility Readiness ?':
				mapped['Your Global Mobility Readiness ?'] || '',
			'Do you already have an offshore or international setup for asset protection and tax efficiency?':
				mapped[
					'Do you already have an offshore or international setup for asset protection and tax efficiency?'
				] || '',
			'If you would chose jurisdiction for incorporation ?':
				mapped['If you would chose jurisdiction for incorporation ?'] || '',
			'Your Health, Security & Personal Infrastructure?':
				mapped['Your Health, Security & Personal Infrastructure?'] || '',

			// блок 7
			'Are you investing globally ?':
				mapped['Are you investing globally ?'] || '',
			'What are the countries where you have investment assets ?':
				mapped['What are the countries where you have investment assets ?'] ||
				'',

			// блок 8
			'What makes you interested in Freedom Business Summit 2026: US Edition and what you want to discover?':
				mapped[
					'What makes you interested in Freedom Business Summit 2026: US Edition and what you want to discover?'
				] || '',
			"What you'll be interested in:":
				mapped["What you'll be interested in:"] || '',

			// блок 9
			'Your financial readiness for global mobility ?':
				mapped[
					'How do you currently see your financial readiness for global mobility?'
				] || '',
			'Would you relocate alone or with family?':
				mapped['Would you relocate alone or with family?'] || '',

			// consent
			Consent:
				mapped[
					'Consent (I confirm the information is accurate and agree to be contacted with relevant opportunities, updates, and next steps)'
				] || false,
		};

		console.log('🚀 FINAL LEAD:', lead);

		// 🚀 відправка в Baserow
		const baserowResponse = await axios.post(
			`https://api.baserow.io/api/database/rows/table/${process.env.BASEROW_TABLE_ID}/?user_field_names=true`,
			lead,
			{
				headers: {
					Authorization: `Token ${process.env.BASEROW_TOKEN}`,
					'Content-Type': 'application/json',
				},
			},
		);

		const rowId = baserowResponse.data.id;
		console.log('✅ BASEROW ROW ID:', rowId);

		res.status(200).json({ success: true });

		sendToVapi(lead)
			.then(async callData => {
				if (!callData?.id) {
					console.log('⚠️ No callId returned from VAPI');
					return;
				}

				const callId = callData.id;
				console.log('✅ CALL ID:', callId);

				const callStatus = callData.status || '';

				await axios.patch(
					`https://api.baserow.io/api/database/rows/table/${process.env.BASEROW_TABLE_ID}/${rowId}/?user_field_names=true`,
					{
						'Vapi Call ID': callId,
						'Call Status': callStatus,
						'Lead Status': getLeadStatus(callStatus), // 👈 ВОТ ЭТО
					},
					{
						headers: {
							Authorization: `Token ${process.env.BASEROW_TOKEN}`,
							'Content-Type': 'application/json',
						},
					},
				);

				console.log('✅ BASEROW UPDATED WITH CALL ID');
			})
			.catch(err => {
				console.error('🔥 VAPI BACKGROUND ERROR:', err.message);
			});
	} catch (error) {
		console.error('❌ ERROR:', error.response?.data || error.message);
		res.status(500).json({ error: 'Webhook error' });
	}
};
