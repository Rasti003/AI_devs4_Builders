import { Message } from "../services/openrouter_client";

const sessions = new Map<string, Message[]>();

export function getSessionMessages(sessionID: string): Message[] {
  return sessions.get(sessionID) ?? [];
}

export function setSessionMessages(
  sessionID: string,
  messages: Message[]
): void {
  sessions.set(sessionID, messages);
}

export function appendMessage(sessionID: string, message: Message): void {
  const current = getSessionMessages(sessionID);
  sessions.set(sessionID, [...current, message]);
}

