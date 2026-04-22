import axios from 'axios';

const BASEROW_TOKEN = 'FdZLWlngmzIFcoORXGkWxroylbibm8C9';
const TABLE_ID = 899262;

export const getLeads = async () => {
	try {
		const res = await axios.get(
			`https://api.baserow.io/api/database/rows/table/${TABLE_ID}/?user_field_names=true`,
			{
				headers: {
					Authorization: `Token ${BASEROW_TOKEN}`,
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
