const required = [
  'MONGO_ROOT_USER',
  'MONGO_ROOT_PASSWORD',
  'MONGO_APP_USER',
  'MONGO_APP_PASSWORD',
  'MONGO_BACKUP_USER',
  'MONGO_BACKUP_PASSWORD',
  'MONGO_RESTORE_TEST_USER',
  'MONGO_RESTORE_TEST_PASSWORD'
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`${key} is required`);
  }
}

db = db.getSiblingDB('admin');

db.createUser({
  user: process.env.MONGO_ROOT_USER,
  pwd: process.env.MONGO_ROOT_PASSWORD,
  roles: [{ role: 'root', db: 'admin' }]
});

db.createUser({
  user: process.env.MONGO_APP_USER,
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: 'readWrite', db: 'menorah' }]
});

db.createUser({
  user: process.env.MONGO_BACKUP_USER,
  pwd: process.env.MONGO_BACKUP_PASSWORD,
  roles: [
    { role: 'backup', db: 'admin' },
    { role: 'readAnyDatabase', db: 'admin' }
  ]
});

db.createUser({
  user: process.env.MONGO_RESTORE_TEST_USER,
  pwd: process.env.MONGO_RESTORE_TEST_PASSWORD,
  roles: [{ role: 'readWrite', db: 'menorah_restore_test' }]
});
