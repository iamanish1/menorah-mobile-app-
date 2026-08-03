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

  const configureLocalStagingMailCapture = () => {
    const hosts = {
      ROOT_DOMAIN: 'root.staging.localhost',
      WWW_DOMAIN: 'www.staging.localhost',
      APP_DOMAIN: 'app.staging.localhost',
      ADMIN_DOMAIN: 'admin.staging.localhost',
      COUNSELLOR_DOMAIN: 'counsellor.staging.localhost',
      API_IOS_DOMAIN: 'api-ios.staging.localhost',
      API_ANDROID_DOMAIN: 'api-android.staging.localhost',
      API_WEB_DOMAIN: 'api-web.staging.localhost',
      API_ADMIN_DOMAIN: 'api-admin.staging.localhost',
      CALLS_DOMAIN: 'calls.staging.localhost',
    };
    const port = '28443';
    const origin = (host) => `https://${host}:${port}`;
    Object.assign(process.env, {
      ...hosts,
      NODE_ENV: 'production',
      DEPLOYMENT_ENVIRONMENT: 'staging',
      MENORAH_LOCAL_STAGING_ENVIRONMENT_ID:
        'menorah-local-staging-v1',
      MENORAH_LOCAL_STAGING_HTTPS_PORT: port,
      MENORAH_STAGING_ALLOWED_HOSTS: Object.values(hosts).join(','),
      MENORAH_STAGING_EMAIL_DOMAIN: 'mail.staging.localhost',
      EMAIL_FROM:
        'Menorah Synthetic <noreply@mail.staging.localhost>',
      CONTACT_TO_EMAIL: 'sink@mail.staging.localhost',
      ALLOWED_ORIGINS: [
        origin(hosts.WWW_DOMAIN),
        origin(hosts.APP_DOMAIN),
        origin(hosts.ADMIN_DOMAIN),
        origin(hosts.COUNSELLOR_DOMAIN),
      ].join(','),
      WEB_SESSION_ORIGINS: [
        `${origin(hosts.WWW_DOMAIN)}=user`,
        `${origin(hosts.APP_DOMAIN)}=user`,
        `${origin(hosts.COUNSELLOR_DOMAIN)}=counsellor`,
        `${origin(hosts.ADMIN_DOMAIN)}=admin`,
      ].join(','),
      LIVEKIT_URL: `wss://${hosts.CALLS_DOMAIN}:${port}`,
      LIVEKIT_API_URL: 'http://livekit:7880',
      PASSWORD_RESET_BASE_URL: origin(hosts.APP_DOMAIN),
      CHECKOUT_RETURN_URL:
        `${origin(hosts.APP_DOMAIN)}/checkout/return`,
      FRONTEND_COUNSELLOR_URL: origin(hosts.COUNSELLOR_DOMAIN),
      FRONTEND_API_WEB_URL: `${origin(hosts.API_WEB_DOMAIN)}/api`,
      FRONTEND_API_ADMIN_URL:
        `${origin(hosts.API_ADMIN_DOMAIN)}/api`,
      FRONTEND_SOCKET_WEB_URL: origin(hosts.API_WEB_DOMAIN),
      MEDIA_PUBLIC_BASE_URL: origin(hosts.API_WEB_DOMAIN),
      RESEND_API_URL: 'http://mail-capture:8025/emails',
      RESEND_API_KEY: `re_local_${'a'.repeat(40)}`,
    });
  };

  const configureServerStagingMailCapture = () => {
    const hosts = {
      ROOT_DOMAIN: 'staging.menorah.me',
      WWW_DOMAIN: 'www.staging.menorah.me',
      APP_DOMAIN: 'app.staging.menorah.me',
      ADMIN_DOMAIN: 'admin.staging.menorah.me',
      COUNSELLOR_DOMAIN: 'counsellor.staging.menorah.me',
      API_IOS_DOMAIN: 'api-ios.staging.menorah.me',
      API_ANDROID_DOMAIN: 'api-android.staging.menorah.me',
      API_WEB_DOMAIN: 'api-web.staging.menorah.me',
      API_ADMIN_DOMAIN: 'api-admin.staging.menorah.me',
      CALLS_DOMAIN: 'calls.staging.menorah.me',
    };
    const port = '38443';
    const origin = (host) => `https://${host}:${port}`;
    Object.assign(process.env, {
      ...hosts,
      NODE_ENV: 'production',
      DEPLOYMENT_ENVIRONMENT: 'staging',
      MENORAH_SERVER_STAGING_ENVIRONMENT_ID:
        'menorah-server-staging-v1',
      MENORAH_SERVER_STAGING_PROJECT_NAME:
        'menorah-server-staging-validation',
      MENORAH_SERVER_STAGING_HTTPS_PORT: port,
      MENORAH_STAGING_ALLOWED_HOSTS: Object.values(hosts).join(','),
      MENORAH_STAGING_EMAIL_DOMAIN: 'mail.staging.menorah.me',
      EMAIL_FROM:
        'Menorah Synthetic <noreply@mail.staging.menorah.me>',
      CONTACT_TO_EMAIL: 'sink@mail.staging.menorah.me',
      ALLOWED_ORIGINS: [
        origin(hosts.WWW_DOMAIN),
        origin(hosts.APP_DOMAIN),
        origin(hosts.ADMIN_DOMAIN),
        origin(hosts.COUNSELLOR_DOMAIN),
      ].join(','),
      WEB_SESSION_ORIGINS: [
        `${origin(hosts.WWW_DOMAIN)}=user`,
        `${origin(hosts.APP_DOMAIN)}=user`,
        `${origin(hosts.COUNSELLOR_DOMAIN)}=counsellor`,
        `${origin(hosts.ADMIN_DOMAIN)}=admin`,
      ].join(','),
      LIVEKIT_URL: `wss://${hosts.CALLS_DOMAIN}:${port}`,
      LIVEKIT_API_URL: 'http://staging-livekit:7880',
      PASSWORD_RESET_BASE_URL: origin(hosts.APP_DOMAIN),
      CHECKOUT_RETURN_URL:
        `${origin(hosts.APP_DOMAIN)}/checkout/return`,
      FRONTEND_COUNSELLOR_URL: origin(hosts.COUNSELLOR_DOMAIN),
      FRONTEND_API_WEB_URL: `${origin(hosts.API_WEB_DOMAIN)}/api`,
      FRONTEND_API_ADMIN_URL:
        `${origin(hosts.API_ADMIN_DOMAIN)}/api`,
      FRONTEND_SOCKET_WEB_URL: origin(hosts.API_WEB_DOMAIN),
      MEDIA_PUBLIC_BASE_URL: origin(hosts.API_WEB_DOMAIN),
      RESEND_API_URL: 'http://staging-mail-capture:8025/emails',
      RESEND_API_KEY: `re_server_staging_${'b'.repeat(40)}`,
    });
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
    delete process.env.RESEND_API_URL;
    delete process.env.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID;
    delete process.env.MENORAH_LOCAL_STAGING_HTTPS_PORT;
    delete process.env.MENORAH_SERVER_STAGING_ENVIRONMENT_ID;
    delete process.env.MENORAH_SERVER_STAGING_PROJECT_NAME;
    delete process.env.MENORAH_SERVER_STAGING_HTTPS_PORT;
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

  test('uses the internal capture URL only for the exact local staging identity', async () => {
    configureLocalStagingMailCapture();
    const recipient = 'synthetic.user@mail.staging.localhost';
    const otp = '918273';
    const { sendOTPEmail } = loadEmail();

    await expect(sendOTPEmail(recipient, otp)).resolves.toBe(true);

    expect(axiosPost).toHaveBeenCalledWith(
      'http://mail-capture:8025/emails',
      expect.objectContaining({
        to: [recipient],
        html: expect.stringContaining(otp),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer re_local_${'a'.repeat(40)}`,
        }),
      })
    );
    const output = serializeCalls(logSpy);
    expect(output).not.toContain(recipient);
    expect(output).not.toContain(otp);
    expect(output).not.toContain(process.env.RESEND_API_KEY);
  });

  test('uses internal capture for the exact isolated server-staging identity', async () => {
    configureServerStagingMailCapture();
    const recipient = 'synthetic.user@mail.staging.menorah.me';
    const { sendOTPEmail } = loadEmail();

    await expect(sendOTPEmail(recipient, '918273')).resolves.toBe(true);

    expect(axiosPost).toHaveBeenCalledWith(
      'http://staging-mail-capture:8025/emails',
      expect.objectContaining({ to: [recipient] }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer re_server_staging_${'b'.repeat(40)}`,
        }),
      })
    );
  });

  test.each([
    ['production project', 'MENORAH_SERVER_STAGING_PROJECT_NAME', 'menorah'],
    ['wrong identity', 'MENORAH_SERVER_STAGING_ENVIRONMENT_ID', 'menorah-server-staging-v2'],
    ['production host', 'API_WEB_DOMAIN', 'api-web.menorah.me'],
  ])(
    'refuses server-staging capture with %s',
    async (_label, key, value) => {
      configureServerStagingMailCapture();
      process.env[key] = value;
      const { sendOTPEmail } = loadEmail();

      await expect(
        sendOTPEmail('synthetic.user@mail.staging.menorah.me', '918273')
      ).resolves.toBe(false);

      expect(axiosPost).not.toHaveBeenCalled();
    }
  );

  test.each([
    'https://api.resend.com/emails',
    'http://mail-capture:8025/emails',
    'http://staging-mail-capture:8025/emails',
    'http://elsewhere:8025/emails',
  ])('rejects every configured email URL in external production (%s)', async (url) => {
    process.env.RESEND_API_URL = url;
    const { sendOTPEmail } = loadEmail();

    await expect(
      sendOTPEmail('private-recipient@example.com', '918273')
    ).resolves.toBe(false);

    expect(axiosPost).not.toHaveBeenCalled();
  });

  test('rejects local capture when the exact generated identity is missing', async () => {
    configureLocalStagingMailCapture();
    delete process.env.MENORAH_LOCAL_STAGING_ENVIRONMENT_ID;
    const { sendOTPEmail } = loadEmail();

    await expect(
      sendOTPEmail('synthetic.user@mail.staging.localhost', '918273')
    ).resolves.toBe(false);

    expect(axiosPost).not.toHaveBeenCalled();
  });

  test('rejects a non-local key before contacting the internal capture', async () => {
    configureLocalStagingMailCapture();
    process.env.RESEND_API_KEY = 'ordinary-test-key';
    const { sendOTPEmail } = loadEmail();

    await expect(
      sendOTPEmail('synthetic.user@mail.staging.localhost', '918273')
    ).resolves.toBe(false);

    expect(axiosPost).not.toHaveBeenCalled();
  });

  test('uses the exact reviewed high-port counsellor staging origin', () => {
    process.env.DEPLOYMENT_ENVIRONMENT = 'staging';
    process.env.FRONTEND_COUNSELLOR_URL =
      'https://counsellor.staging.localhost:28443';
    const { buildCounsellorAppUrl } = loadEmail();

    expect(buildCounsellorAppUrl('/register')).toBe(
      'https://counsellor.staging.localhost:28443/register'
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

  test.each([
    ['user', 'https://app.menorah.me/reset-password#token='],
    ['counsellor', 'https://counsellor.menorah.me/reset-password#token='],
  ])('sends %s recovery to the correct portal without a query-string token', async (role, expectedUrl) => {
    process.env.FRONTEND_COUNSELLOR_URL = 'https://counsellor.menorah.me';
    const token = role === 'user' ? 'b'.repeat(64) : 'c'.repeat(64);
    const { sendPasswordResetEmail } = loadEmail();

    await expect(
      sendPasswordResetEmail(`${role}@example.com`, token, { role })
    ).resolves.toBe(true);

    const [, payload] = axiosPost.mock.calls[0];
    expect(payload.html).toContain(`${expectedUrl}${token}`);
    expect(payload.html).not.toContain(`?token=${token}`);
  });

  test('emails counsellor temporary credentials and the expiring reset link', async () => {
    process.env.FRONTEND_COUNSELLOR_URL = 'https://counsellor.menorah.me';
    const { sendCounsellorCredentialsEmail } = loadEmail();

    await expect(sendCounsellorCredentialsEmail({
      email: 'asha@example.com',
      name: 'Asha',
      password: 'TempPass1!',
      resetToken: 'a'.repeat(64),
      kind: 'onboarding',
    })).resolves.toBe(true);

    const [, payload] = axiosPost.mock.calls[0];
    expect(payload).toMatchObject({
      to: ['asha@example.com'],
      subject: 'Your Menorah counsellor account is ready',
    });
    expect(payload.html).toContain('TempPass1!');
    expect(payload.html).toContain(
      `https://counsellor.menorah.me/reset-password#token=${'a'.repeat(64)}`
    );
    expect(payload.html).toContain('Sign in to counsellor portal');
    expect(payload.html).toContain('expires in <strong>10 minutes</strong>');
  });
});
