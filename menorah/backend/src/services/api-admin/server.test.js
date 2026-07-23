const mockStartService = jest.fn();
const mockEnforcePrivacyAdminPermissionAuthority = jest.fn();

jest.mock('../../shared/app/startService', () => ({
  startService: (...args) => mockStartService(...args),
}));
jest.mock('../privacyAdminPermissionAuthority', () => ({
  enforcePrivacyAdminPermissionAuthority: (...args) => (
    mockEnforcePrivacyAdminPermissionAuthority(...args)
  ),
}));

const { start } = require('./server');

describe('api-admin startup privacy authority', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStartService.mockResolvedValue({ state: { booted: true } });
  });

  test('runs permission authority enforcement after database connection', async () => {
    await start();

    expect(mockStartService).toHaveBeenCalledWith(expect.objectContaining({
      serviceName: 'api-admin',
      routeProfile: 'api-admin',
      afterDatabaseConnect: expect.any(Function),
    }));
    const [{ afterDatabaseConnect }] = mockStartService.mock.calls[0];
    await afterDatabaseConnect({ serviceName: 'api-admin' });
    expect(mockEnforcePrivacyAdminPermissionAuthority)
      .toHaveBeenCalledWith({ serviceName: 'api-admin' });
  });
});
