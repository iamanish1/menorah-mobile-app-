const mockStartService = jest.fn();
const mockEnforceAdminPermissionAuthority = jest.fn();
const mockEnforcePrivacyAdminPermissionAuthority = jest.fn();

jest.mock('../../shared/app/startService', () => ({
  startService: (...args) => mockStartService(...args),
}));
jest.mock('../privacyAdminPermissionAuthority', () => ({
  enforcePrivacyAdminPermissionAuthority: (...args) => (
    mockEnforcePrivacyAdminPermissionAuthority(...args)
  ),
}));
jest.mock('../adminPermissionAuthority', () => ({
  enforceAdminPermissionAuthority: (...args) => (
    mockEnforceAdminPermissionAuthority(...args)
  ),
}));

const { start } = require('./server');

describe('api-admin startup permission authorities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStartService.mockResolvedValue({ state: { booted: true } });
  });

  test('runs operational and privacy authority enforcement after database connection', async () => {
    await start();

    expect(mockStartService).toHaveBeenCalledWith(expect.objectContaining({
      serviceName: 'api-admin',
      routeProfile: 'api-admin',
      afterDatabaseConnect: expect.any(Function),
    }));
    const [{ afterDatabaseConnect }] = mockStartService.mock.calls[0];
    await afterDatabaseConnect({ serviceName: 'api-admin' });
    expect(mockEnforceAdminPermissionAuthority)
      .toHaveBeenCalledWith({ serviceName: 'api-admin' });
    expect(mockEnforcePrivacyAdminPermissionAuthority)
      .toHaveBeenCalledWith({ serviceName: 'api-admin' });
    expect(mockEnforceAdminPermissionAuthority.mock.invocationCallOrder[0])
      .toBeLessThan(mockEnforcePrivacyAdminPermissionAuthority.mock.invocationCallOrder[0]);
  });
});
