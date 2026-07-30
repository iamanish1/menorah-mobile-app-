jest.mock('axios', () => ({ post: jest.fn() }));

describe('counsellor credential email', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    require('axios').post.mockReset();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      APP_DOMAIN: 'app.menorah.me',
      PASSWORD_RESET_URL_TEMPLATE: 'https://app.menorah.me/reset-password?token={token}',
      RESEND_API_KEY: 'test-resend-key',
      EMAIL_FROM: 'Menorah Health <noreply@menorah.me>',
      FRONTEND_COUNSELLOR_URL: 'https://counsellor.menorah.me',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test.each([
    ['user', 'https://app.menorah.me/reset-password?token='],
    ['counsellor', 'https://counsellor.menorah.me/reset-password?token='],
  ])('sends %s self-service recovery to the correct portal', async (role, expectedUrl) => {
    const axios = require('axios');
    axios.post.mockResolvedValue({ data: { id: 'email-id' } });
    const { sendPasswordResetEmail } = require('../email');
    const resetToken = role === 'user' ? 'b'.repeat(64) : 'c'.repeat(64);

    const sent = await sendPasswordResetEmail(
      `${role}@example.com`,
      resetToken,
      { role },
    );

    expect(sent).toBe(true);
    expect(axios.post).toHaveBeenCalledTimes(1);
    const [, payload] = axios.post.mock.calls[0];
    expect(payload.to).toEqual([`${role}@example.com`]);
    expect(payload.html).toContain(`${expectedUrl}${resetToken}`);
  });

  test('includes both the temporary password and secure reset link', async () => {
    const axios = require('axios');
    axios.post.mockResolvedValue({ data: { id: 'email-id' } });
    const { sendCounsellorCredentialsEmail } = require('../email');

    const sent = await sendCounsellorCredentialsEmail({
      email: 'asha@example.com',
      name: 'Asha',
      password: 'TempPass1!',
      resetToken: 'a'.repeat(64),
      kind: 'onboarding',
    });

    expect(sent).toBe(true);
    expect(axios.post).toHaveBeenCalledTimes(1);
    const [, payload] = axios.post.mock.calls[0];
    expect(payload).toMatchObject({
      to: ['asha@example.com'],
      subject: 'Your Menorah counsellor account is ready',
    });
    expect(payload.html).toContain('TempPass1!');
    expect(payload.html).toContain(
      `https://counsellor.menorah.me/reset-password?token=${'a'.repeat(64)}`,
    );
    expect(payload.html).toContain('Sign in to counsellor portal');
    expect(payload.html).toContain('expires in <strong>10 minutes</strong>');
  });
});
