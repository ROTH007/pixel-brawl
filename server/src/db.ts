// ============================================================
//  Tiny JSON-file database (good for development / V1).
//  មូលដ្ឋានទិន្នន័យតូចមួយប្រើ file JSON — ល្អសម្រាប់ចាប់ផ្តើម។
//  Later you can swap this file for Supabase/PostgreSQL —
//  the rest of the server only uses the functions below.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { Appearance, DEFAULT_APPEARANCE } from '../../shared/game.ts';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  appearance: Appearance;
  wins: number;
  matches: number;
  kos: number;
  createdAt: string;
}

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'users.json');

let users: Record<string, User> = {};

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) users = JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

let saveTimer: NodeJS.Timeout | null = null;
function save() {
  // batch writes so many updates at once only write the file once
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(users, null, 2));
    fs.renameSync(tmp, FILE);
  }, 200);
}

load();

export const db = {
  findByUsername(username: string): User | undefined {
    const u = username.toLowerCase();
    return Object.values(users).find((x) => x.username.toLowerCase() === u);
  },
  findById(id: string): User | undefined {
    return users[id];
  },
  create(username: string, passwordHash: string): User {
    const id = crypto.randomUUID();
    const user: User = {
      id, username, passwordHash,
      appearance: { ...DEFAULT_APPEARANCE },
      wins: 0, matches: 0, kos: 0,
      createdAt: new Date().toISOString(),
    };
    users[id] = user;
    save();
    return user;
  },
  update(id: string, patch: Partial<User>) {
    if (!users[id]) return;
    users[id] = { ...users[id], ...patch };
    save();
  },
};

/** Fields that are safe to send to the browser (no password hash) */
export function publicUser(u: User) {
  return { id: u.id, username: u.username, appearance: u.appearance,
           wins: u.wins, matches: u.matches, kos: u.kos };
}
