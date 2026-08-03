const MESSAGE_STATUS_RANK = {
  sent: 0,
  delivered: 1,
  read: 2,
};

function mergeChatMessages(existing, incoming) {
  const byId = new Map(existing.map((message) => [message.id, message]));

  incoming.forEach((message) => {
    const current = byId.get(message.id);
    const currentStatus = current?.status || 'sent';
    const incomingStatus = message.status || 'sent';
    byId.set(message.id, {
      ...current,
      ...message,
      status: MESSAGE_STATUS_RANK[currentStatus] > MESSAGE_STATUS_RANK[incomingStatus]
        ? currentStatus
        : incomingStatus,
    });
  });

  return [...byId.values()].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

module.exports = { mergeChatMessages };
