const replicaSetName = process.env.MONGODB_REPLICA_SET_NAME || 'menorah-rs';
const primary = process.env.MONGO_PRIMARY_HOST || 'mongo-primary:27017';
const memberHosts = (process.env.MONGO_REPLICA_SET_MEMBERS || primary)
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);
const delayedSeconds = Number(process.env.MONGO_DELAYED_SECONDS || 86400);

try {
  rs.status();
  print(`Replica set ${replicaSetName} is already initialized`);
} catch (_err) {
  rs.initiate({
    _id: replicaSetName,
    members: memberHosts.map((host, index) => ({
      _id: index,
      host,
      priority: index === 0 ? 2 : (index === memberHosts.length - 1 && memberHosts.length > 2 ? 0 : 1),
      ...(index === memberHosts.length - 1 && memberHosts.length > 2
        ? { hidden: true, secondaryDelaySecs: delayedSeconds }
        : {})
    }))
  });
}
