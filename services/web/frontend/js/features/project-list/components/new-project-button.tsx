import { useCallback, useState } from 'react'
import { Dropdown, MenuItem } from 'react-bootstrap'
import { useTranslation } from 'react-i18next'
import { ExposedSettings } from '../../../../../types/exposed-settings'
import type { PortalTemplate } from '../../../../../types/portal-template'
import ControlledDropdown from '../../../shared/components/controlled-dropdown'
import getMeta from '../../../utils/meta'
import NewProjectButtonModal, {
  NewProjectButtonModalVariant,
} from './new-project-button/new-project-button-modal'
import { Nullable } from '../../../../../types/utils'
import { sendMB } from '../../../infrastructure/event-tracking'

type SendTrackingEvent = {
  dropdownMenu: string
  dropdownOpen: boolean
  institutionTemplateName?: string
}

type Segmentation = SendTrackingEvent & {
  'project-dashboard-react': 'enabled'
}

type ModalMenuClickOptions = {
  modalVariant: NewProjectButtonModalVariant
  dropdownMenuEvent: string
}

type NewProjectButtonProps = {
  id: string
  buttonText?: string
  className?: string
  trackingKey?: string
}

function NewProjectButton({
  id,
  buttonText,
  className,
  trackingKey,
}: NewProjectButtonProps) {
  const { t } = useTranslation()
  const { templateLinks } = getMeta('ol-ExposedSettings') as ExposedSettings
  const [modal, setModal] =
    useState<Nullable<NewProjectButtonModalVariant>>(null)
  const portalTemplates = getMeta('ol-portalTemplates') as PortalTemplate[]

  const sendTrackingEvent = useCallback(
    ({
      dropdownMenu,
      dropdownOpen,
      institutionTemplateName,
    }: SendTrackingEvent) => {
      if (trackingKey) {
        let segmentation: Segmentation = {
          'project-dashboard-react': 'enabled',
          dropdownMenu,
          dropdownOpen,
        }

        if (institutionTemplateName) {
          segmentation = {
            ...segmentation,
            institutionTemplateName,
          }
        }

        sendMB(trackingKey, segmentation)
      }
    },
    [trackingKey]
  )

  const handleMainButtonClick = useCallback(
    (dropdownOpen: boolean) => {
      sendTrackingEvent({
        dropdownMenu: 'main-button',
        dropdownOpen,
      })
    },
    [sendTrackingEvent]
  )

  const handleModalMenuClick = useCallback(
    (
      e: React.MouseEvent<Record<string, unknown>>,
      { modalVariant, dropdownMenuEvent }: ModalMenuClickOptions
    ) => {
      // avoid invoking the "onClick" callback on the main dropdown button
      e.stopPropagation()

      sendTrackingEvent({
        dropdownMenu: dropdownMenuEvent,
        dropdownOpen: true,
      })

      setModal(modalVariant)
    },
    [sendTrackingEvent]
  )

  const handlePortalTemplateClick = useCallback(
    (
      e: React.MouseEvent<Record<string, unknown>>,
      institutionTemplateName: string
    ) => {
      // avoid invoking the "onClick" callback on the main dropdown button
      e.stopPropagation()

      sendTrackingEvent({
        dropdownMenu: 'institution-template',
        dropdownOpen: true,
        institutionTemplateName,
      })
    },
    [sendTrackingEvent]
  )

  const handleStaticTemplateClick = useCallback(
    (
      e: React.MouseEvent<Record<string, unknown>>,
      templateTrackingKey: string
    ) => {
      // avoid invoking the "onClick" callback on the main dropdown button
      e.stopPropagation()

      sendTrackingEvent({
        dropdownMenu: templateTrackingKey,
        dropdownOpen: true,
      })
    },
    [sendTrackingEvent]
  )

  return (
    <>
      <ControlledDropdown
        id={id}
        className={className}
        onMainButtonClick={handleMainButtonClick}
      >
        <Dropdown.Toggle
          noCaret
          className="new-project-button"
          bsStyle="primary"
        >
          {buttonText || t('new_project')}
        </Dropdown.Toggle>
        <Dropdown.Menu>
          <MenuItem
            onClick={e =>
              handleModalMenuClick(e, {
                modalVariant: 'blank_project',
                dropdownMenuEvent: 'blank-project',
              })
            }
          >
            {t('blank_project')}
          </MenuItem>
          <MenuItem
            onClick={e =>
              handleModalMenuClick(e, {
                modalVariant: 'example_project',
                dropdownMenuEvent: 'example-project',
              })
            }
          >
            {t('example_project')}
          </MenuItem>
          <MenuItem
            onClick={e =>
              handleModalMenuClick(e, {
                modalVariant: 'upload_project',
                dropdownMenuEvent: 'upload-project',
              })
            }
          >
            {t('upload_project')}
          </MenuItem>
          <MenuItem
            onClick={e =>
              handleModalMenuClick(e, {
                modalVariant: 'import_from_github',
                dropdownMenuEvent: 'import-from-github',
              })
            }
          >
            {t('import_from_github')}
          </MenuItem>
          {portalTemplates?.length > 0 ? (
            <>
              <MenuItem divider />
              <MenuItem header>
                {`${t('institution')} ${t('templates')}`}
              </MenuItem>
              {portalTemplates.map((portalTemplate, index) => (
                <MenuItem
                  key={`portal-template-${index}`}
                  href={`${portalTemplate.url}#templates`}
                  onClick={e =>
                    handlePortalTemplateClick(e, portalTemplate.name)
                  }
                >
                  {portalTemplate.name}
                </MenuItem>
              ))}
            </>
          ) : null}
          <MenuItem divider />
          <MenuItem header>{t('templates')}</MenuItem>
          {templateLinks.map((templateLink, index) => (
            <MenuItem
              key={`new-project-button-template-${index}`}
              href={templateLink.url}
              onClick={e =>
                handleStaticTemplateClick(e, templateLink.trackingKey)
              }
            >
              {templateLink.name === 'view_all'
                ? t('view_all')
                : templateLink.name}
            </MenuItem>
          ))}
        </Dropdown.Menu>
      </ControlledDropdown>
      <NewProjectButtonModal modal={modal} onHide={() => setModal(null)} />
    </>
  )
}

export default NewProjectButton
