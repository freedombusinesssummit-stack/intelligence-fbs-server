import axios from 'axios';
import crypto from 'crypto';

// ── Field parsing ─────────────────────────────────────────────────────────────

const parseFields = fields => {
	const result = {};

	fields.forEach(f => {
		// HIDDEN_FIELDS: UTM params & other hidden values
		if (f.type === 'HIDDEN_FIELDS') {
			const subFields = f.fields || (Array.isArray(f.value) ? f.value : []);
			subFields.forEach(hf => {
				if (hf.key) result[hf.key] = hf.value ?? '';
			});
			return;
		}

		const key = f.label || f.type;
		if (!key) return;

		if (f.type === 'MULTIPLE_CHOICE') {
			result[key] =
				f.options
					?.filter(o => f.value?.includes(o.id))
					.map(o => o.text)
					.join(', ') || '';
		} else if (f.type === 'CHECKBOXES') {
			result[key] = Array.isArray(f.value)
				? f.options
						?.filter(o => f.value.includes(o.id))
						.map(o => o.text)
						.join(', ') || ''
				: (f.value ?? '');
		} else {
			result[key] = f.value ?? '';
		}
	});

	return result;
};

// Find value by partial label match (case-insensitive), returns first match
const pick = (map, ...partials) => {
	for (const partial of partials) {
		const key = Object.keys(map).find(k =>
			k.toLowerCase().includes(partial.toLowerCase()),
		);
		if (key !== undefined) return map[key] || '';
	}
	return '';
};

// ── Score & Tier ─────────────────────────────────────────────────────────────

const SCORE_RULES = [
	// Timeline urgency (max 30)
	{
		max: 30,
		fn: m => {
			const v = pick(m, 'relocating within 12', 'timeline').toLowerCase();
			if (v.includes('3')) return 30;
			if (v.includes('6')) return 20;
			if (v.includes('12') || v.includes('year')) return 10;
			return v ? 5 : 0;
		},
	},
	// Income (max 30)
	{
		max: 30,
		fn: m => {
			const v = pick(
				m,
				'annual personal income',
				'annual income',
				'capital',
			).toLowerCase();
			if (v.match(/500k|\b1m\b|million|1,000/)) return 30;
			if (v.match(/200k|300k|400k/)) return 20;
			if (v.match(/100k|150k/)) return 10;
			return v ? 5 : 0;
		},
	},
	// Offshore setup (max 10)
	{
		max: 10,
		fn: m =>
			pick(m, 'offshore or international setup').toLowerCase().includes('yes')
				? 10
				: 0,
	},
	// Investing globally (max 10)
	{
		max: 10,
		fn: m =>
			pick(m, 'investing globally').toLowerCase().includes('yes') ? 10 : 0,
	},
	// Multi-country activity (max 10)
	{
		max: 10,
		fn: m => {
			const v = pick(m, 'how many countries are you currently active');
			if (v.match(/[3-9]|\d{2,}/)) return 10;
			if (v.includes('2')) return 5;
			return 0;
		},
	},
	// Financial readiness (max 10)
	{
		max: 10,
		fn: m =>
			pick(m, 'financial readiness')
				.toLowerCase()
				.match(/ready|high|strong/)
				? 10
				: 0,
	},
];

// Use Tally's own quiz score if present, otherwise calculate
const calculateScore = mapped => {
	const tallyScore = Number(mapped['score']);
	if (!isNaN(tallyScore) && mapped['score'] !== '' && mapped['score'] !== undefined)
		return Math.min(tallyScore, 100);
	return Math.min(
		SCORE_RULES.reduce((total, rule) => total + rule.fn(mapped), 0),
		100,
	);
};

const getTier = score => (score >= 70 ? 'A' : score >= 40 ? 'B' : 'C');

// ── Lead code ─────────────────────────────────────────────────────────────────

const generateLeadCode = (formId = '') => {
	const year = new Date().getFullYear();
	const hash = crypto
		.createHash('sha256')
		.update(`${formId}-${Date.now()}-${Math.random()}`)
		.digest('hex')
		.slice(0, 5)
		.toUpperCase();
	return `FBS-${year}-${hash}`;
};

// ── UTM extraction ─────────────────────────────────────────────────────────────

const UTM_KEYS = [
	'utm_source',
	'utm_medium',
	'utm_campaign',
	'utm_term',
	'utm_content',
];

const extractUTM = mapped => {
	const utm = {};
	UTM_KEYS.forEach(k => {
		if (mapped[k]) utm[k] = mapped[k];
	});
	return utm;
};

// ── Answers categorization ────────────────────────────────────────────────────

// Each entry: [category, ...keyword patterns]
const CATEGORY_PATTERNS = [
	[
		'personal',
		'located now',
		'us citizen',
		'nationality',
		'live in the u.s',
		'another country residency',
		'what countries',
		'relocate alone or with family',
	],
	[
		'professional',
		'professional industry',
		'your position',
		'company website',
		'linkedin',
		'describes your situation',
	],
	[
		'financial',
		'annual personal income',
		'offshore or international setup',
		'jurisdiction for incorporation',
		'investing globally',
		'investment assets',
		'financial readiness',
		'current focus',
	],
	[
		'relocation',
		'relocating within 12',
		'residency or citizenship program',
		'residency program is appealing',
		'how many countries are you currently active',
		'current situation regarding the u.s',
		'current global strategy',
	],
	[
		'summit',
		'freedom business summit',
		"what you'll be interested",
		'global mobility readiness',
		'health, security',
	],
];

const buildAnswers = (mapped, skipKeys) => {
	const categories = {};

	Object.entries(mapped).forEach(([key, value]) => {
		if (skipKeys.has(key)) return;
		if (!value && value !== 0) return; // skip empty

		const keyLower = key.toLowerCase();
		let placed = false;

		for (const [cat, ...patterns] of CATEGORY_PATTERNS) {
			if (patterns.some(p => keyLower.includes(p))) {
				if (!categories[cat]) categories[cat] = {};
				categories[cat][key] = value;
				placed = true;
				break;
			}
		}

		if (!placed) {
			if (!categories.other) categories.other = {};
			categories.other[key] = value;
		}
	});

	return categories;
};

// ── VAPI ───────────────────────────────────────────────────────────────────────

const sendToVapi = async (lead, rowId) => {
	try {
		const phone = (lead['Phone number'] || '')
			.replace(/\s+/g, '')
			.replace(/[^+\d]/g, '');

		if (!phone) {
			console.log('⚠️ VAPI SKIP: no phone');
			return null;
		}

		console.log('📞 Sending to VAPI:', phone);

		const leadName = lead.Name || '';
		const jurisdiction = lead.Programme || '';
		const timeline = lead.Timeline || '';

		const response = await axios.post(
			'https://api.vapi.ai/call',
			{
				assistantId: 'dd0536e5-256f-4371-938e-c859b09d6d4f',
				phoneNumberId: process.env.VAPI_PHONE_ID,
				customer: { number: phone, name: leadName },
				assistantOverrides: {
					variableValues: {
						lead_name: leadName,
						company: lead.Company || '',
						jurisdiction,
						annual_capital: lead['What is your annual personal income?'] || '',
						timeline,
					},
				},
				metadata: {
					name: leadName,
					phone,
					email: lead.Email || '',
					programme: jurisdiction,
					timeline,
					rowId,
				},
			},
			{
				headers: {
					Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
					'Content-Type': 'application/json',
				},
			},
		);

		console.log('✅ VAPI SUCCESS:', {
			id: response.data?.id,
			status: response.data?.status,
		});
		return response.data;
	} catch (error) {
		console.error('❌ VAPI ERROR:', error.response?.data || error.message);
		return null;
	}
};

// ── Webhook handler ────────────────────────────────────────────────────────────

export const handleTallyWebhook = async (req, res) => {
	try {
		console.log('🔥 TALLY RAW:', JSON.stringify(req.body, null, 2));

		const { formId, fields = [], respondentId } = req.body?.data || {};

		const mapped = parseFields(fields);
		console.log('📋 MAPPED:', JSON.stringify(mapped, null, 2));

		// ── Main fields ──────────────────────────────────────────────────────────
		const name = pick(mapped, 'your full name', 'full name');
		const email = pick(mapped, 'best email to get in touch', 'email');
		const phone = pick(
			mapped,
			'best whatsapp',
			'whatsapp',
			'phone number',
			'phone',
		);
		const country =
			mapped["Respondent's country"] ||
			mapped['RESPONDENT_COUNTRY'] ||
			pick(mapped, 'located now');
		const residencyProgram =
			pick(mapped, 'residency or citizenship program is appealing') ||
			pick(mapped, 'residency program is appealing');
		const programme = residencyProgram
			? `Freedom Business Summit 2026 USA Edition | ${residencyProgram}`
			: 'Freedom Business Summit 2026 USA Edition';

		// Pick timeline only if the value contains a concrete timeframe
		const timelineRaw =
			pick(mapped, 'global mobility readiness') ||
			pick(mapped, 'relocating within 12 months');
		const timeline = /\d/.test(timelineRaw) ? timelineRaw : '';

		// ── UTM ──────────────────────────────────────────────────────────────────
		const utm = extractUTM(mapped);
		const utmSource = utm.utm_source || '';

		// ── Score & Tier ─────────────────────────────────────────────────────────
		const score = calculateScore(mapped);
		const tier = getTier(score);

		// ── Unique lead code ─────────────────────────────────────────────────────
		const leadCode = generateLeadCode(formId);

		// ── Categorized answers (skip extracted main fields & UTM) ────────────────
		const skipKeys = new Set([
			...Object.keys(mapped).filter(k => {
				const kl = k.toLowerCase();
				return (
					kl.includes('your full name') ||
					kl.includes('full name') ||
					kl.includes('best email') ||
					kl.includes('email') ||
					kl.includes('whatsapp') ||
					kl.includes('phone') ||
					kl.includes('respondent') ||
					kl === 'score' ||
					kl.includes('consent')
				);
			}),
			...UTM_KEYS,
		]);

		const answers = buildAnswers(mapped, skipKeys);

		// ── Build Baserow row ────────────────────────────────────────────────────
		const row = {
			Name: name,
			Email: email,
			'Phone number': phone,
			Country: country,
			Programme: programme,
			Timeline: timeline,
			'UTM Source': utmSource,
			UTM: Object.keys(utm).length ? JSON.stringify(utm) : '',
			Score: score,
			Tier: tier,
			'Lead Status': 'New',
			'Form ID': formId || '',
			'Lead Code': leadCode,
			Answers: JSON.stringify(answers, null, 2),
		};

		console.log('🚀 LEAD:', {
			name,
			email,
			phone,
			score,
			tier,
			programme,
			timeline,
			utmSource,
			formId,
			leadCode,
		});

		const baserowResponse = await axios.post(
			`https://api.baserow.io/api/database/rows/table/${process.env.BASEROW_TABLE_LEADS_ID}/?user_field_names=true`,
			row,
			{
				headers: {
					Authorization: `Token ${process.env.BASEROW_TOKEN}`,
					'Content-Type': 'application/json',
				},
			},
		);

		const rowId = baserowResponse.data.id;
		console.log('✅ BASEROW ROW ID:', rowId);

		res.status(200).json({ success: true, leadCode });

		// ── VAPI call in background ───────────────────────────────────────────────
		sendToVapi(row, rowId)
			.then(async callData => {
				if (!callData?.id) return;

				await axios.patch(
					`https://api.baserow.io/api/database/rows/table/${process.env.BASEROW_TABLE_LEADS_ID}/${rowId}/?user_field_names=true`,
					{
						'Vapi Call ID': callData.id,
						Call: callData.status || 'queued',
					},
					{
						headers: {
							Authorization: `Token ${process.env.BASEROW_TOKEN}`,
							'Content-Type': 'application/json',
						},
					},
				);

				console.log('✅ VAPI call ID saved to Baserow');
			})
			.catch(err => console.error('🔥 VAPI BG ERROR:', err.message));
	} catch (error) {
		console.error(
			'❌ TALLY WEBHOOK ERROR:',
			error.response?.data || error.message,
		);
		res.status(500).json({ error: 'Webhook error' });
	}
};
