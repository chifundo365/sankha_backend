import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();
const app = express();

app.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

export default app;
