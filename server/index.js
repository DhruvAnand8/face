import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const DATA_PATH = path.join(__dirname, 'data', 'users.json');
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

function readUsers() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    return [];
  }
}

function saveUsers(users) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(users, null, 2), 'utf8');
}

app.get('/api/users', (req, res) => {
  res.json(readUsers());
});

app.post('/api/users', (req, res) => {
  const { name, email, employerId, descriptor } = req.body;
  if (!name || !email || !employerId || !descriptor || !Array.isArray(descriptor)) {
    return res.status(400).json({ error: 'Name, email, employerId, and descriptor are required' });
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  const users = readUsers();
  
  // Check for duplicate name or email
  if (users.find((u) => u.name.toLowerCase() === name.trim().toLowerCase())) {
    return res.status(400).json({ error: 'Name already registered' });
  }
  if (users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
    return res.status(400).json({ error: 'Email already registered' });
  }
  
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const user = {
    id,
    name: name.trim(),
    email: email.trim(),
    employerId: employerId.trim(),
    descriptor,
    createdAt: new Date().toISOString(),
    lastLogin: null
  };
  users.push(user);
  saveUsers(users);
  res.status(201).json(user);
});

app.put('/api/users/:id/login', (req, res) => {
  const users = readUsers();
  const index = users.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  users[index].lastLogin = new Date().toISOString();
  saveUsers(users);
  res.json(users[index]);
});

app.delete('/api/users/:id', (req, res) => {
  const users = readUsers();
  const filtered = users.filter((item) => item.id !== req.params.id);
  saveUsers(filtered);
  res.json({ success: true, count: filtered.length });
});

app.listen(PORT, () => {
  console.log(`FacePass server running on http://localhost:${PORT}`);
});
