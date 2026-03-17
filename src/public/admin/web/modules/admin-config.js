export const loginPath = '/admin/login';
export const dashboardPath = '/admin/dashboard';
export const allowedAdminRoles = new Set(['admin', 'developer']);

export const VIEW_CONTENT = Object.freeze({
  overview: {
    title: 'Overview',
    description: 'Session state, API key telemetry and quick operational refresh.',
  },
  provisioning: {
    title: 'Create Key',
    description: 'Provision new partner credentials without leaving the console shell.',
  },
  keys: {
    title: 'Manage Keys',
    description: 'Inspect existing keys and execute rotate, revoke or reactivate flows.',
  },
  audit: {
    title: 'Audit Logs',
    description: 'Inspect partner activity, failed auth and operational events in one place.',
  },
});
