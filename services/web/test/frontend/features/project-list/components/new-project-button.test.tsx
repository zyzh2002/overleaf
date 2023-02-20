import { fireEvent, screen } from '@testing-library/react'
import { expect } from 'chai'
import fetchMock from 'fetch-mock'
import NewProjectButton from '../../../../../frontend/js/features/project-list/components/new-project-button'
import { renderWithProjectListContext } from '../helpers/render-with-context'

describe('<NewProjectButton />', function () {
  beforeEach(function () {
    fetchMock.reset()
  })

  describe('for every user (affiliated and non-affiliated)', function () {
    beforeEach(function () {
      window.metaAttributesCache.set('ol-ExposedSettings', {
        templateLinks: [
          {
            name: 'Academic Journal',
            url: '/gallery/tagged/academic-journal',
          },
          {
            name: 'View All',
            url: '/latex/templates',
          },
        ],
      })

      renderWithProjectListContext(<NewProjectButton id="test" />)

      const newProjectButton = screen.getByRole('button', {
        name: 'New Project',
      })
      fireEvent.click(newProjectButton)
    })

    afterEach(function () {
      window.metaAttributesCache = new Map()
    })

    it('shows the correct dropdown menu', function () {
      // static menu
      screen.getByText('Blank Project')
      screen.getByText('Example Project')
      screen.getByText('Upload Project')
      screen.getByText('Import from GitHub')

      // static text
      screen.getByText('Templates')

      // dynamic menu based on templateLinks
      screen.getByText('Academic Journal')
      screen.getByText('View All')
    })

    it('open new project modal when clicking at Blank Project', function () {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Blank Project' }))

      screen.getByPlaceholderText('Project Name')
    })

    it('open new project modal when clicking at Example Project', function () {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Example Project' }))

      screen.getByPlaceholderText('Project Name')
    })

    it('close the new project modal when clicking at the top right "x" button', function () {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Blank Project' }))
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))

      expect(screen.queryByRole('dialog')).to.be.null
    })

    it('close the new project modal when clicking at the Cancel button', function () {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Blank Project' }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByRole('dialog')).to.be.null
    })
  })

  describe('for affiliated user with custom templates', function () {
    beforeEach(function () {
      window.metaAttributesCache.set('ol-ExposedSettings', {
        templateLinks: [
          {
            name: 'Academic Journal',
            url: '/gallery/tagged/academic-journal',
          },
          {
            name: 'View All',
            url: '/latex/templates',
          },
        ],
      })

      window.metaAttributesCache.set('ol-portalTemplates', [
        {
          name: 'Affiliation 1',
          url: '/edu/test-new-template',
        },
      ])
    })

    afterEach(function () {
      window.metaAttributesCache = new Map()
    })

    it('shows the correct dropdown menu', function () {
      renderWithProjectListContext(<NewProjectButton id="test" />)

      const newProjectButton = screen.getByRole('button', {
        name: 'New Project',
      })

      fireEvent.click(newProjectButton)
      // static menu
      screen.getByText('Blank Project')
      screen.getByText('Example Project')
      screen.getByText('Upload Project')
      screen.getByText('Import from GitHub')

      // static text for institution templates
      screen.getByText('Institution Templates')

      // dynamic menu based on portalTemplates
      const affiliationTemplate = screen.getByRole('menuitem', {
        name: 'Affiliation 1',
      })
      expect(affiliationTemplate.getAttribute('href')).to.equal(
        '/edu/test-new-template#templates'
      )

      // static text
      screen.getByText('Templates')

      // dynamic menu based on templateLinks
      screen.getByText('Academic Journal')
      screen.getByText('View All')
    })
  })
})
