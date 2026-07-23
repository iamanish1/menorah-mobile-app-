const serializeCalls = (spy) => JSON.stringify(spy.mock.calls);

describe('email delivery logging', () => {
  const originalEnv = process.env;
  let axiosPost;
  let logSpy;
  let errorSpy;

  const loadEmail = () => {
    jest.resetModules();
    jest.doMock('axios', () => ({
      post: axiosPost,
    }));
    return require('../email');
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      DEPLOYMENT_ENVIRONMENT: 'production',
      RESEND_API_KEY: 'test-resend-key',
      EMAIL_FROM: 'Menorah <noreply@example.com>',
      PASSWORD_RESET_BASE_URL: 'https://app.menorah.me',
    };
    axiosPost = jest.fn().mockResolvedValue({ status: 200 });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    jest.dontMock('axios');
    jest.resetModules();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('sends production email without logging recipient, subject, or content', async () => {
    const recipient = 'private-recipient@example.com';
    const otp = '918273';
    const { sendOTPEmail } = loadEmail();

    await expect(sendOTPEmail(recipient, otp)).resolves.toBe(true);

    expect(axiosPost).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        to: [recipient],
        subject: 'Menorah Health \u2013 Email Verification',
        html: expect.stringContaining(otp),
      }),
      expect.any(Object)
    );
    const output = serializeCalls(logSpy);
    expect(output).toContain('Email sent via Resend');
    expect(output).not.toContain(recipient);
    expect(output).not.toContain('Menorah Health \u2013 Email Verification');
    expect(output).not.toContain(otp);
  });

  test('defaults an omitted deployment selector to production delivery', async () => {
    delete process.env.DEPLOYMENT_ENVIRONMENT;
    const recipient = 'production-recipient@example.com';
    const { sendOTPEmail } = loadEmail();

    await expect(sendOTPEmail(recipient, '918273')).resolves.toBe(true);

    expect(axiosPost).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ to: [recipient] }),
      expect.any(Object)
    );
  });

  test.each([
    undefined,
    'mail.example.com',
    'mail-staging.example.com',
    'MAIL.STAGING.EXAMPLE.COM',
  ])(
    'blocks staging delivery with invalid email-domain selector %s',
    async (stagingDomain) => {
      process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
      if (stagingDomain === undefined) {
        delete process.env.MENORAH_STAGING_EMAIL_DOMAIN;
      } else {
        process.env.MENORAH_STAGING_EMAIL_DOMAIN = stagingDomain;
      }
      const { sendOTPEmail } = loadEmail();

      await expect(
        sendOTPEmail('recipient@mail.staging.example.com', '918273')
      ).resolves.toBe(false);

      expect(axiosPost).not.toHaveBeenCalled();
    }
  );

  test.each([
    'real-recipient@gmail.com',
    'Menorah Test <recipient@mail.staging.example.com>',
    'recipient@MAIL.STAGING.EXAMPLE.COM',
    'first@mail.staging.example.com,second@mail.staging.example.com',
  ])('blocks unsafe staging recipient %s', async (recipient) => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    process.env.MENORAH_STAGING_EMAIL_DOMAIN = 'mail.staging.example.com';
    const { sendOTPEmail } = loadEmail();

    await expect(sendOTPEmail(recipient, '918273')).resolves.toBe(false);

    expect(axiosPost).not.toHaveBeenCalled();
    expect(serializeCalls(errorSpy)).not.toContain(recipient);
  });

  test('blocks delivery for an unsupported nonempty deployment selector', async () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'preview';
    const { sendOTPEmail } = loadEmail();

    await expect(
      sendOTPEmail('production-recipient@example.com', '918273')
    ).resolves.toBe(false);

    expect(axiosPost).not.toHaveBeenCalled();
  });

  test('delivers to a bare recipient on the exact staging email domain', async () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    process.env.MENORAH_STAGING_EMAIL_DOMAIN = 'mail.staging.example.com';
    process.env.EMAIL_FROM =
      'Menorah Staging <noreply@mail.staging.example.com>';
    const recipient = 'synthetic.user@mail.staging.example.com';
    const { sendOTPEmail } = loadEmail();

    await expect(sendOTPEmail(recipient, '918273')).resolves.toBe(true);

    expect(axiosPost).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ to: [recipient] }),
      expect.any(Object)
    );
  });

  test('suppresses provider response data and email identifiers on failure', async () => {
    const recipient = 'failure-recipient@example.com';
    const token = 'private-reset-token';
    axiosPost.mockRejectedValue({
      message: `Provider rejected ${recipient}`,
      code: 'ERR_BAD_REQUEST',
      response: {
        status: 400,
        data: {
          message: `Reset Your Menorah Health Password ${token}`,
        },
      },
    });
    const { sendPasswordResetEmail } = loadEmail();

    await expect(sendPasswordResetEmail(recipient, token)).resolves.toBe(false);

    const output = serializeCalls(errorSpy);
    expect(output).toContain('Email delivery provider request failed');
    expect(output).not.toContain(recipient);
    expect(output).not.toContain('Reset Your Menorah Health Password');
    expect(output).not.toContain(token);
  });

  test('suppresses recipient, subject, and reset token in development logs', async () => {
    process.env.NODE_ENV = 'test';
    const recipient = 'development-recipient@example.com';
    const token = 'development-reset-token';
    const { sendPasswordResetEmail } = loadEmail();

    await expect(sendPasswordResetEmail(recipient, token)).resolves.toBe(true);

    expect(axiosPost).not.toHaveBeenCalled();
    const output = serializeCalls(logSpy);
    expect(output).toContain('recipient, subject, and content suppressed');
    expect(output).not.toContain(recipient);
    expect(output).not.toContain('Reset Your Menorah Health Password');
    expect(output).not.toContain(token);
  });
});
