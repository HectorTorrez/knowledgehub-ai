import { createFileRoute, Outlet } from '@tanstack/react-router';
import { DocumentNotificationsProvider } from '~/hooks/use-document-notifications';

export const Route = createFileRoute(
  '/_authenticated/organizations/$organizationId',
)({
  component: OrganizationLayout,
});

function OrganizationLayout() {
  const { organizationId } = Route.useParams();
  return (
    <DocumentNotificationsProvider
      key={organizationId}
      organizationId={organizationId}
    >
      <Outlet />
    </DocumentNotificationsProvider>
  );
}
