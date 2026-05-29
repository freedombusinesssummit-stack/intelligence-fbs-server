import express from 'express';
import leadRoutes from './routes/lead.routes.js';
import tallyRoutes from './routes/tally.routes.js';
import vapiRoutes from './routes/vapi.routes.js';

import cors from 'cors';

const app = express();
app.use(
	cors({
		origin: '*',
	}),
);
app.use(express.json());

// подключаем роуты
app.get('/health', (req, res) => {
	res.status(200).json({ status: 'ok' });
});
app.use('/api/leads', leadRoutes);
app.use('/api/tally', tallyRoutes);
app.use('/api/vapi', vapiRoutes);

export default app;
