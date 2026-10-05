// ============================================================
//  Talking to the server: login, register, character, rooms
//  ការភ្ជាប់ទៅ server (HTTP API)
// ============================================================
import { Client, Room } from 'colyseus.js';
import type { Appearance } from '../../shared/game.ts';

// In development the game runs on :5173 and the server on :2567.
// In production the server serves the game, so they share one address.
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ||
  (location.port === '5173' ? `${location.protocol}//${location.hostname}:2567` : location.origin);

export interface PublicUser {
  id: string; username: string; appearance: Appearance; wins: number; matches: number; kos: number;
}
export interface RoomInfo {
  code: string; name: string; host: string; phase: string;
  players: number; maxPlayers: number; locked: boolean;
}

const TOKEN_KEY = 'pixelbrawl_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(SERVER_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Cannot reach the game server. Is it running?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
  return data as T;
}

export const api = {
  register: (username: string, password: string) =>
    request<{ token: string; user: PublicUser }>('/api/register', 'POST', { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; user: PublicUser }>('/api/login', 'POST', { username, password }),
  me: () => request<{ user: PublicUser }>('/api/me'),
  saveCharacter: (appearance: Appearance) =>
    request<{ appearance: Appearance }>('/api/character', 'PUT', { appearance }),
  rooms: () => request<RoomInfo[]>('/api/rooms'),
};

// ---------- multiplayer ----------
const client = new Client(SERVER_URL);

export function createRoom(roomName: string, maxPlayers: number, isPrivate: boolean): Promise<Room> {
  return client.create('arena', { token: getToken(), roomName, maxPlayers, isPrivate });
}

export function joinRoom(code: string): Promise<Room> {
  return client.joinById(code.trim().toUpperCase(), { token: getToken() });
}
