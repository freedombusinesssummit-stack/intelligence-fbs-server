import axios from 'axios';

const parseJSONField = value => {
	if (!value || typeof value !== 'string') return value;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
};

const normalizeLead = lead => ({
	...lead,
	Answers: parseJSONField(lead.Answers),
	UTM: parseJSONField(lead.UTM),
});

const fetchTable = async tableId => {
	const res = await axios.get(
		`https://api.baserow.io/api/database/rows/table/${tableId}/?user_field_names=true`,
		{
			headers: { Authorization: `Token ${process.env.BASEROW_TOKEN}` },
		},
	);
	return res.data.results.map(normalizeLead);
};

export const getLeads = async () => {
	try {
		return await fetchTable(process.env.BASEROW_TABLE_LEADS_ID);
	} catch (error) {
		console.error('Baserow error:', error.response?.data || error.message);
		throw new Error(
			error.response?.data?.detail || error.response?.data?.error || error.message || 'Error fetching leads',
		);
	}
};

export const getLeadsByFormId = async formId => {
	try {
		const headers = { Authorization: `Token ${process.env.BASEROW_TOKEN}` };
		const base = `https://api.baserow.io/api/database/rows/table/${process.env.BASEROW_TABLE_LEADS_ID}/`;
		const filter = `filter__Form%20ID__equal=${encodeURIComponent(formId)}`;

		let results = [];
		let page = 1;
		let hasMore = true;

		while (hasMore) {
			const res = await axios.get(
				`${base}?user_field_names=true&${filter}&page=${page}&size=200`,
				{ headers },
			);
			results = results.concat(res.data.results);
			hasMore = !!res.data.next;
			page++;
		}

		return results.map(normalizeLead);
	} catch (error) {
		console.error('Baserow error:', error.response?.data || error.message);
		throw new Error(
			error.response?.data?.detail || error.response?.data?.error || error.message || 'Error fetching leads',
		);
	}
};

export const getLeadsDemo = async () => {
	try {
		return await fetchTable(process.env.BASEROW_TABLE_DEMO_ID);
	} catch (error) {
		console.error('Baserow error:', error.response?.data || error.message);
		throw new Error(
			error.response?.data?.detail || error.response?.data?.error || error.message || 'Error fetching leads',
		);
	}
};