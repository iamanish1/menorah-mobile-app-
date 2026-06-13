const replicaSetName = process.env.MONGODB_REPLICA_SET_NAME || 'menorah-rs';
const primary = process.env.MONGO_PRIMARY_HOST || 'mongo-primary:27017';
const secondaryVps = process.env.MONGO_SECONDARY_VPS_HOST || 'mongo-secondary-vps:27017';
const delayed = process.env.MONGO_DELAYED_HOST || 'mongo-secondary-cloud:27017';
const delayedSeconds = Number(process.env.MONGO_DELAYED_SECONDS || 86400);

rs.initiate({
  _id: replicaSetName,
  members: [
    {
      _id: 0,
      host: primary,
      priority: 2
    },
    {
      _id: 1,
      host: secondaryVps,
      priority: 1
    },
    {
      _id: 2,
      host: delayed,
      priority: 0,
      hidden: true,
      secondaryDelaySecs: delayedSeconds
    }
  ]
});
