const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mergeChatMessages } = require('../src/lib/chatMessages');

const root = path.resolve(__dirname, '..');
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('REST snapshots merge with live messages without duplicates or reordering', () => {
  const live = [{
    id: 'message-2',
    content: 'live',
    timestamp: '2026-08-02T10:02:00.000Z',
    status: 'read',
  }];
  const olderPage = [
    {
      id: 'message-1',
      content: 'older',
      timestamp: '2026-08-02T10:01:00.000Z',
      status: 'sent',
    },
    {
      id: 'message-2',
      content: 'live',
      timestamp: '2026-08-02T10:02:00.000Z',
      status: 'sent',
    },
  ];

  assert.deepEqual(
    mergeChatMessages(live, olderPage).map(({ id, status }) => ({ id, status })),
    [
      { id: 'message-1', status: 'sent' },
      { id: 'message-2', status: 'read' },
    ]
  );
});

test('room focus owns one join/fetch lifecycle and supports older history', () => {
  const thread = source('src/screens/chat/ChatThread.tsx');
  const chatState = source('src/state/useChat.tsx');

  assert.match(thread, /useFocusEffect/);
  assert.match(
    thread,
    /fetchMessages\(\s*roomId\s*,\s*\{\s*page:\s*pagination\.page\s*\+\s*1/
  );
  assert.doesNotMatch(chatState, /const joinRoom[\s\S]*?fetchMessages\(roomId\)/);
});

test('socket client listens for reconnects on the manager and for deletions', () => {
  const socket = source('src/lib/socket.ts');

  assert.match(socket, /socket\.io\.on\('reconnect_attempt'/);
  assert.match(socket, /socket\.on\('message_deleted'/);
});
