import {
  AdminCatalogForm,
  EMPTY_CATALOG_EPISODE_FORM_VALUES,
} from './AdminCatalogForm'

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
