import axios from 'axios';

export const getLeads = async () => {
	try {
		const res = await axios.get(
			`https://api.baserow.io/api/database/rows/table/${process.env.BASEROW_TABLE_LEADS_ID}/?user_field_names=true`,
			{
				headers: {
					Authorization: `Token ${process.env.BASEROW_TOKEN}`,
				},
			},
		);

		return res.data.results;
	} catch (error) {
		console.error('Baserow error:', error.response?.data || error.message);
		throw new Error(
			error.response?.data?.detail ||
				error.response?.data?.error ||
				error.message ||
				'Error fetching leads',
		);
	}
};

export const getLeadsDemo = async () => {
	try {
		const res = await axios.get(
			`https://api.baserow.io/api/database/rows/table/${process.env.BASEROW_TABLE_DEMO_ID}/?user_field_names=true`,
			{
				headers: {
					Authorization: `Token ${process.env.BASEROW_TOKEN}`,
				},
			},
		);

		return res.data.results;
	} catch (error) {
		console.error('Baserow error:', error.response?.data || error.message);
		throw new Error(
			error.response?.data?.detail ||
				error.response?.data?.error ||
				error.message ||
				'Error fetching leads',
		);
	}
};
