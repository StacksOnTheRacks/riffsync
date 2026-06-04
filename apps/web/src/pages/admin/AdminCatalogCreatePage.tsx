import { EMPTY_CATALOG_EPISODE_FORM_VALUES } from '../../catalog/validateCatalogEpisodeForm'
import { AdminCatalogForm } from './AdminCatalogForm'

export function AdminCatalogCreatePage() {
  return (
    <AdminCatalogForm
      mode="create"
      initialEpisode={null}
      initialValues={EMPTY_CATALOG_EPISODE_FORM_VALUES}
      breadcrumbLeaf="New episode"
      pageTitle="New episode"
    />
  )
}
