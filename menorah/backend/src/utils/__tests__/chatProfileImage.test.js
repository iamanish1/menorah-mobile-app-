const {
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
});
