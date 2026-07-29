const mongoose = require('mongoose');

const {
  asStringId,
  getChatSenderImage,
  getCounsellorProfileImage,
} = require('../chatProfileImage');

describe('chat profile image resolution', () => {
  const counsellor = {
    _id: 'counsellor-id',
    profileImage: 'https://cdn.example/counsellor.jpg',
    user: { _id: 'counsellor-user-id', profileImage: 'https://cdn.example/user-mirror.jpg' },
  };

  test('prefers the counsellor profile image over its mirrored user image', () => {
    expect(getCounsellorProfileImage(counsellor)).toBe('https://cdn.example/counsellor.jpg');
  });

  test('uses the counsellor image for counsellor-authored chat messages', () => {
    expect(getChatSenderImage({
      sender: { _id: 'counsellor-user-id', profileImage: 'https://cdn.example/user-mirror.jpg' },
      counsellor,
    })).toBe('https://cdn.example/counsellor.jpg');
  });

  test('keeps the user image for user-authored chat messages', () => {
    expect(getChatSenderImage({
      sender: { _id: 'patient-id', profileImage: 'https://cdn.example/patient.jpg' },
      counsellor,
    })).toBe('https://cdn.example/patient.jpg');
  });

  test('serializes Mongoose ObjectIds without recursing through their self _id getter', () => {
    const id = new mongoose.Types.ObjectId();

    expect(asStringId(id)).toBe(id.toHexString());
  });

  test('uses the counsellor image when populated chat records contain Mongoose ObjectIds', () => {
    const counsellorUserId = new mongoose.Types.ObjectId();

    expect(getChatSenderImage({
      sender: {
        _id: counsellorUserId,
        profileImage: 'https://cdn.example/user-mirror.jpg',
      },
      counsellor: {
        profileImage: 'https://cdn.example/counsellor.jpg',
        user: { _id: counsellorUserId },
      },
    })).toBe('https://cdn.example/counsellor.jpg');
  });
});
